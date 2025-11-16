import type {
  Chronicle,
  ChronicleClosureEvent,
  ChronicleSummaryKind,
  ChronicleSnapshotV2,
  Location,
} from '@glass-frontier/worldstate';
import {
  DynamoWorldStateStore,
  type WorldStateStoreV2,
} from '@glass-frontier/worldstate';
import { createAwsDynamoClient, createAwsS3Client } from '@glass-frontier/node-utils';
import { LangGraphLlmClient } from '@glass-frontier/llm-client';
import { log } from '@glass-frontier/utils';
import { randomUUID } from 'node:crypto';

import {
  LocationEventsResponseSchema,
  buildBeatLines,
  buildCharacterImpactPrompt,
  buildChronicleStoryPrompt,
  buildLocationEventsPrompt,
  buildTurnArtifacts,
  flattenLocationEvents,
  hasSummary,
  sanitizeSentence,
  type LocationEventFragment,
  type SummaryContext,
} from './summaryHelpers';

type ChronicleSnapshot = ChronicleSnapshotV2;

const SUMMARY_HANDLERS: ChronicleSummaryKind[] = [
  'chronicle_story',
  'location_events',
  'character_echo',
];

const requireEnv = (value: string | undefined | null, name: string): string => {
  if (value?.trim()) return value;
  throw new Error(`chronicle-closer missing required env var ${name}`);
};

const defaultWorldStateStore = new DynamoWorldStateStore({
  tableName: requireEnv(process.env.WORLD_STATE_TABLE_NAME, 'WORLD_STATE_TABLE_NAME'),
  bucketName: requireEnv(process.env.WORLD_STATE_S3_BUCKET, 'WORLD_STATE_S3_BUCKET'),
  s3Prefix: process.env.WORLD_STATE_S3_PREFIX ?? undefined,
  dynamoClient: createAwsDynamoClient(),
  s3Client: createAwsS3Client(),
});

class ChronicleClosureProcessor {
  readonly #worldStateStore: WorldStateStoreV2;
  readonly #llm: LangGraphLlmClient;

  constructor(options?: { worldStateStore?: WorldStateStoreV2; llmClient?: LangGraphLlmClient }) {
    this.#worldStateStore = options?.worldStateStore ?? defaultWorldStateStore;
    this.#llm = options?.llmClient ?? new LangGraphLlmClient();
  }

  async process(event: ChronicleClosureEvent): Promise<void> {
    const snapshot = await this.#worldStateStore.getChronicleSnapshot(event.chronicleId);
    if (snapshot === null || snapshot.chronicle === null) {
      log('warn', 'chronicle-closer.snapshot-missing', { chronicleId: event.chronicleId });
      return;
    }
    const context = await this.#buildContext(snapshot);
    const kinds = SUMMARY_HANDLERS.filter((kind) => event.summaryKinds.includes(kind));
    await Promise.all(
      kinds.map((kind) =>
        this.#runSummary(kind, context, event).catch((error) => {
          log('error', 'chronicle-closer.summary-error', {
            chronicleId: event.chronicleId,
            kind,
            reason: error instanceof Error ? error.message : 'unknown',
          });
        })
      )
    );
  }

  async #runSummary(
    kind: ChronicleSummaryKind,
    context: SummaryContext,
    event: ChronicleClosureEvent
  ): Promise<void> {
    switch (kind) {
    case 'chronicle_story':
      await this.#generateChronicleStorySummary(context, event);
      break;
    case 'location_events':
      await this.#generateLocationEvents(context, event);
      break;
    case 'character_echo':
      await this.#recordCharacterEcho(context, event);
      break;
    default:
      break;
    }
  }

  async #buildContext(snapshot: ChronicleSnapshot): Promise<SummaryContext> {
    const chronicle = snapshot.chronicle;
    const location = await this.#resolveLocation(chronicle);
    const beatLines = buildBeatLines(chronicle);
    const { inventoryHighlights, skillHighlights, transcript } = buildTurnArtifacts(
      snapshot.turns
    );
    return {
      beatLines,
      character: snapshot.character ?? null,
      chronicle,
      inventoryHighlights,
      location,
      skillHighlights,
      transcript,
    };
  }

  async #resolveLocation(chronicle: Chronicle): Promise<Location | null> {
    if (!chronicle.locationId) return null;
    return this.#worldStateStore.getLocation(chronicle.locationId);
  }

  async #generateChronicleStorySummary(
    context: SummaryContext,
    event: ChronicleClosureEvent
  ): Promise<void> {
    const chronicle = context.chronicle;
    if (hasSummary(chronicle, 'chronicle_story')) {
      return;
    }
    const prompt = buildChronicleStoryPrompt(context);
    const result = await this.#llm.generateText({
      maxTokens: 550,
      metadata: {
        chronicleId: chronicle.id,
        operation: 'chronicle-closer.story',
      },
      prompt,
      temperature: 0.35,
    });
    const summary = result.text.trim();
    if (summary.length === 0) {
      return;
    }
    await this.#worldStateStore.appendChronicleSummary(chronicle.id, {
      createdAt: Date.now(),
      id: randomUUID(),
      kind: 'chronicle_story',
      metadata: {
        provider: result.provider,
        requestId: result.requestId,
        turnSequence: event.turnSequence,
      },
      summary,
    });
    log('info', 'chronicle-closer.story-recorded', { chronicleId: chronicle.id });
  }

  async #generateLocationEvents(
    context: SummaryContext,
    event: ChronicleClosureEvent
  ): Promise<void> {
    const chronicle = context.chronicle;
    if (!chronicle.locationId) return;
    if (await this.#hasRecordedLocationEvents(chronicle)) {
      return;
    }
    const result = await this.#fetchLocationEventFragments(context, chronicle);
    if (result === null) {
      return;
    }
    await this.#worldStateStore.appendLocationEvents({
      locationId: chronicle.locationId,
      events: result.fragments.map((fragment) => ({
        chronicleId: chronicle.id,
        summary: fragment.summary,
        scope: fragment.name,
        metadata: {
          provider: result.provider,
          requestId: result.requestId,
          turnSequence: event.turnSequence,
        },
      })),
    });
    log('info', 'chronicle-closer.location-events-recorded', {
      chronicleId: chronicle.id,
      eventCount: result.fragments.length,
    });
  }

  async #recordCharacterEcho(
    context: SummaryContext,
    event: ChronicleClosureEvent
  ): Promise<void> {
    const character = context.character;
    if (character === null) {
      return;
    }
    const prompt = buildCharacterImpactPrompt(context);
    const result = await this.#llm.generateText({
      maxTokens: 150,
      metadata: {
        characterId: character.id,
        chronicleId: context.chronicle.id,
        operation: 'chronicle-closer.character-impact',
      },
      prompt,
      temperature: 0.2,
    });
    const summary = sanitizeSentence(result.text);
    if (summary.length === 0) {
      return;
    }
    const nextLegacies = [
      ...(character.echoes ?? []),
      {
        chronicleId: context.chronicle.id,
        summary,
        createdAt: new Date().toISOString(),
        metadata: {
          provider: result.provider,
          requestId: result.requestId,
          turnSequence: event.turnSequence,
        },
      },
    ];
    await this.#worldStateStore.updateCharacter({
      ...character,
      echoes: nextLegacies,
    });
    log('info', 'chronicle-closer.character-echo-recorded', {
      characterId: character.id,
      chronicleId: context.chronicle.id,
      turnSequence: event.turnSequence,
    });
  }

  async #hasRecordedLocationEvents(chronicle: Chronicle): Promise<boolean> {
    if (!chronicle.locationId) return true;
    const existing = await this.#worldStateStore.listLocationEvents(chronicle.locationId);
    return existing.some((entry) => entry.chronicleId === chronicle.id);
  }

  async #fetchLocationEventFragments(
    context: SummaryContext,
    chronicle: Chronicle
  ): Promise<{ fragments: LocationEventFragment[]; provider?: string; requestId: string } | null> {
    const prompt = buildLocationEventsPrompt(context);
    try {
      const response = await this.#llm.generateJson({
        maxTokens: 600,
        metadata: {
          chronicleId: chronicle.id,
          operation: 'chronicle-closer.location-events',
        },
        prompt,
        temperature: 0.25,
      });
      const parsed = LocationEventsResponseSchema.safeParse(response.json);
      if (!parsed.success) {
        log('warn', 'chronicle-closer.location-parse-failed', {
          chronicleId: chronicle.id,
          reason: parsed.error.message,
        });
        return null;
      }
      const fragments = flattenLocationEvents(parsed.data);
      if (fragments.length === 0) {
        return null;
      }
      return { fragments, provider: response.provider, requestId: response.requestId };
    } catch (error) {
      log('error', 'chronicle-closer.location-events-request-failed', {
          chronicleId: chronicle.id,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      return null;
    }
  }
}

export { ChronicleClosureProcessor };
