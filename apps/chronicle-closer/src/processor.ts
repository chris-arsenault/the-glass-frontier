import type {
  Chronicle,
  ChronicleClosureEvent,
  ChronicleSummaryKind,
  LocationSummary,
} from '@glass-frontier/dto';
import {createLLMClient, RetryLLMClient} from '@glass-frontier/llm-client';
import {
  createLocationStore,
  createWorldStateStore,
  type LocationStore,
  type WorldStateStore,
} from '@glass-frontier/worldstate';
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

type ChronicleSnapshot = NonNullable<Awaited<ReturnType<WorldStateStore['getChronicleState']>>>;

const SUMMARY_HANDLERS: ChronicleSummaryKind[] = [
  'chronicle_story',
  'location_events',
  'character_bio',
];

class ChronicleClosureProcessor {
  readonly #worldStateStore: WorldStateStore;
  readonly #locationGraphStore: LocationStore;
  readonly #llm: RetryLLMClient;

  constructor(options?: {
    worldStateStore?: WorldStateStore;
    locationGraphStore?: LocationStore;
    llmClient?: RetryLLMClient;
  }) {
    const worldstateDatabaseUrl = process.env.GLASS_FRONTIER_DATABASE_URL ?? '';
    if (!options?.worldStateStore && worldstateDatabaseUrl.trim().length === 0) {
      throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured for the chronicle closer.');
    }

    this.#locationGraphStore =
      options?.locationGraphStore ??
      createLocationStore({ connectionString: worldstateDatabaseUrl });
    this.#worldStateStore =
      options?.worldStateStore ??
      createWorldStateStore({
        connectionString: worldstateDatabaseUrl,
        locationGraphStore: this.#locationGraphStore,
      });
    this.#llm = options?.llmClient ?? createLLMClient();
  }

  async process(event: ChronicleClosureEvent): Promise<void> {
    const snapshot = await this.#worldStateStore.getChronicleState(event.chronicleId);
    if (snapshot === null || snapshot.chronicle === undefined) {
      log('warn', 'chronicle-closer.snapshot-missing', { chronicleId: event.chronicleId });
      return;
    }
    const context = await this.#buildContext(snapshot);
    const kinds = SUMMARY_HANDLERS.filter((kind) => event.summaryKinds.includes(kind));
    const tasks = kinds.map((kind) =>
      this.#runSummary(kind, context, event).catch((error) => {
        log('error', 'chronicle-closer.summary-error', {
          chronicleId: event.chronicleId,
          kind,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      })
    );
    await Promise.all(tasks);
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
    case 'character_bio':
      await this.#generateCharacterBio(context, event);
      break;
    default:
      break;
    }
  }

  async #buildContext(snapshot: ChronicleSnapshot): Promise<SummaryContext> {
    const chronicle = snapshot.chronicle;
    const locationName = await this.#resolveLocationName(chronicle);
    const locationSummary = await this.#resolveLocationSummary(snapshot);
    const beatLines = buildBeatLines(chronicle);
    const { inventoryHighlights, skillHighlights, transcript } = buildTurnArtifacts(
      snapshot.turns
    );
    return {
      beatLines,
      character: snapshot.character ?? null,
      chronicle,
      inventoryHighlights,
      locationName,
      locationSummary,
      skillHighlights,
      transcript,
    };
  }

  async #resolveLocationName(chronicle: Chronicle): Promise<string> {
    const place = await this.#locationGraphStore.getPlace(chronicle.locationId);
    if (place !== null) {
      return place.name;
    }
    return 'Unknown Location';
  }

  async #resolveLocationSummary(snapshot: ChronicleSnapshot): Promise<LocationSummary | null> {
    const characterId = snapshot.character?.id;
    if (typeof characterId !== 'string' || characterId.trim().length === 0) {
      return null;
    }
    const state = await this.#locationGraphStore.getLocationState(characterId);
    if (!state) {
      return null;
    }
    const breadcrumb = await this.#locationGraphStore.getLocationChain({
      anchorId: state.anchorPlaceId,
    });
    return {
      anchorPlaceId: state.anchorPlaceId,
      breadcrumb,
      certainty: state.certainty,
      description: undefined,
      status: state.status ?? [],
      tags: [],
    };
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
    const result = await this.#llm.generate({
      maxTokens: 550,
      metadata: {
        chronicleId: chronicle.id,
        operation: 'chronicle-closer.story',
      },
      prompt,
      temperature: 0.35,
    }, 'string');
    const summary = result.text.trim();
    if (summary.length === 0) {
      return;
    }
    const entry = {
      createdAt: Date.now(),
      id: randomUUID(),
      kind: 'chronicle_story' as const,
      metadata: {
        provider: result.provider,
        requestId: result.requestId,
        turnSequence: event.turnSequence,
      },
      summary,
    };
    await this.#worldStateStore.upsertChronicle({
      ...chronicle,
      summaries: [...(chronicle.summaries ?? []), entry],
    });
    log('info', 'chronicle-closer.story-recorded', { chronicleId: chronicle.id });
  }

  async #generateLocationEvents(
    context: SummaryContext,
    event: ChronicleClosureEvent
  ): Promise<void> {
    const chronicle = context.chronicle;
    if (await this.#hasRecordedLocationEvents(chronicle)) {
      return;
    }
    const result = await this.#fetchLocationEventFragments(context, chronicle);
    if (result === null) {
      return;
    }
    await this.#persistLocationEvents({
      chronicle,
      fragments: result.fragments,
      provider: result.provider,
      requestId: result.requestId,
      turnSequence: event.turnSequence,
    });
  }

  async #generateCharacterBio(
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
    await this.#worldStateStore.upsertCharacter({
      ...character,
      bio: summary,
    });
    log('info', 'chronicle-closer.character-bio-recorded', {
      characterId: character.id,
      chronicleId: context.chronicle.id,
      turnSequence: event.turnSequence,
    });
  }

  async #hasRecordedLocationEvents(chronicle: Chronicle): Promise<boolean> {
    const existing = await this.#locationGraphStore.listLocationEvents({
      locationId: chronicle.locationId,
    });
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

  async #persistLocationEvents(input: {
    chronicle: Chronicle;
    fragments: LocationEventFragment[];
    provider?: string;
    requestId: string;
    turnSequence: number;
  }): Promise<void> {
    await this.#locationGraphStore.appendLocationEvents({
      events: input.fragments.map((entry) => ({
        chronicleId: input.chronicle.id,
        metadata: {
          provider: input.provider,
          requestId: input.requestId,
          scope: entry.name,
          turnSequence: input.turnSequence,
        },
        scope: entry.name,
        summary: entry.summary,
      })),
      locationId: input.chronicle.locationId,
    });
    log('info', 'chronicle-closer.location-events-recorded', {
      chronicleId: input.chronicle.id,
      eventCount: input.fragments.length,
    });
  }

}

export { ChronicleClosureProcessor };
