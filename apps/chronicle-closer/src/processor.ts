import type {
  Chronicle,
  ChronicleClosureEvent,
  ChronicleSummaryKind,
  LocationEntity,
} from '@glass-frontier/dto';
import {createLLMClient, RetryLLMClient} from '@glass-frontier/llm-client';
import {
  createChronicleStore,
  createWorldSchemaStore,
  type ChronicleStore,
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

type ChronicleSnapshot = NonNullable<Awaited<ReturnType<ChronicleStore['getChronicleState']>>>;

const SUMMARY_HANDLERS: ChronicleSummaryKind[] = ['chronicle_story', 'character_bio'];

class ChronicleClosureProcessor {
  readonly #chronicleStore: ChronicleStore;
  readonly #llm: RetryLLMClient;

  constructor(options?: {
    chronicleStore?: ChronicleStore;
    llmClient?: RetryLLMClient;
  }) {
    const worldstateDatabaseUrl = process.env.GLASS_FRONTIER_DATABASE_URL ?? '';
    if (!options?.chronicleStore && worldstateDatabaseUrl.trim().length === 0) {
      throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured for the chronicle closer.');
    }

    const worldSchemaStore = createWorldSchemaStore({
      connectionString: worldstateDatabaseUrl,
    });
    this.#chronicleStore =
      options?.chronicleStore ??
      createChronicleStore({
        connectionString: worldstateDatabaseUrl,
        worldStore: worldSchemaStore,
      });
    this.#llm = options?.llmClient ?? createLLMClient();
  }

  async process(event: ChronicleClosureEvent): Promise<void> {
    const snapshot = await this.#chronicleStore.getChronicleState(event.chronicleId);
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
    const locationSummary = await this.#resolveLocationEntity(snapshot);
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
    return chronicle.locationId ?? 'Unknown Location';
  }

  async #resolveLocationEntity(snapshot: ChronicleSnapshot): Promise<LocationEntity | null> {
    return snapshot.location ?? null;
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
    await this.#chronicleStore.upsertChronicle({
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
    await this.#chronicleStore.upsertCharacter({
      ...character,
      bio: summary,
    });
    log('info', 'chronicle-closer.character-bio-recorded', {
      characterId: character.id,
      chronicleId: context.chronicle.id,
      turnSequence: event.turnSequence,
    });
  }

  // Stub implementations - these need proper implementation
  async #hasRecordedLocationEvents(_chronicle: Chronicle): Promise<boolean> {
    // TODO: Check if location events have already been recorded
    return false;
  }

  async #fetchLocationEventFragments(
    _context: SummaryContext,
    _chronicle: Chronicle
  ): Promise<{ fragments: unknown[]; provider: string; requestId: string } | null> {
    // TODO: Fetch and generate location event fragments
    return null;
  }

  async #persistLocationEvents(_input: {
    chronicle: Chronicle;
    fragments: unknown[];
    provider: string;
    requestId: string;
    turnSequence: number;
  }): Promise<void> {
    // TODO: Persist location events to storage
  }

}

export { ChronicleClosureProcessor };
