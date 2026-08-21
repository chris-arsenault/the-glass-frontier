import type { ModelConfigStore } from '@glass-frontier/app';
import type {
  ChronicleClosureEvent,
  ChronicleSummaryEntry,
} from '@glass-frontier/dto';
import type { LLMRequest, LLMResponse, RetryLLMClient } from '@glass-frontier/llm-client';
import { log } from '@glass-frontier/utils';
import type { ChronicleStore } from '@glass-frontier/worldstate';

import {
  buildBeatLines,
  buildCharacterImpactPrompt,
  buildChronicleStoryPrompt,
  buildTurnArtifacts,
  sanitizeSentence,
  type SummaryContext,
} from './summaryHelpers';

type ChronicleSnapshot = NonNullable<Awaited<ReturnType<ChronicleStore['getChronicleState']>>>;

type ImplementedSummaryKind = 'chronicle_story' | 'character_bio';

class ChronicleClosureProcessor {
  readonly #chronicleStore: ChronicleStore;
  readonly #llm: RetryLLMClient;
  readonly #modelConfigStore: ModelConfigStore;

  constructor(options: {
    chronicleStore: ChronicleStore;
    llmClient: RetryLLMClient;
    modelConfigStore: ModelConfigStore;
  }) {
    this.#chronicleStore = options.chronicleStore;
    this.#llm = options.llmClient;
    this.#modelConfigStore = options.modelConfigStore;
  }

  async process(event: ChronicleClosureEvent): Promise<void> {
    const snapshot = await this.#chronicleStore.getChronicleState(event.chronicleId);
    if (snapshot === null) {
      throw new Error(`Chronicle ${event.chronicleId} was not found for closure.`);
    }
    this.#assertEventMatchesSnapshot(event, snapshot);
    const context = this.#buildContext(snapshot);
    if (event.summaryKinds.includes('chronicle_story')) {
      await this.#runSummary('chronicle_story', context, event);
    }
    if (event.summaryKinds.includes('character_bio')) {
      await this.#runSummary('character_bio', context, event);
    }
  }

  #assertEventMatchesSnapshot(
    event: ChronicleClosureEvent,
    snapshot: ChronicleSnapshot
  ): void {
    const { chronicle } = snapshot;
    if (chronicle.status !== 'closed') {
      throw new Error(`Chronicle ${chronicle.id} is not closed.`);
    }
    if (
      chronicle.playerId !== event.playerId ||
      chronicle.locationId !== event.locationId ||
      chronicle.characterId !== event.characterId
    ) {
      throw new Error(`Closure event does not match chronicle ${chronicle.id}.`);
    }
    if (snapshot.turnSequence !== event.turnSequence) {
      throw new Error(
        `Closure event turn ${event.turnSequence} does not match chronicle turn ${snapshot.turnSequence}.`
      );
    }
  }

  async #runSummary(
    kind: ImplementedSummaryKind,
    context: SummaryContext,
    event: ChronicleClosureEvent
  ): Promise<void> {
    if (context.chronicle.summaries.some((summary) => summary.kind === kind)) {
      return;
    }
    switch (kind) {
    case 'chronicle_story':
      await this.#generateChronicleStorySummary(context, event);
      break;
    case 'character_bio':
      await this.#generateCharacterBio(context, event);
      break;
    }
  }

  #buildContext(snapshot: ChronicleSnapshot): SummaryContext {
    const { inventoryHighlights, skillHighlights, transcript } = buildTurnArtifacts(
      snapshot.turns
    );
    return {
      beatLines: buildBeatLines(snapshot.chronicle),
      character: snapshot.character,
      chronicle: snapshot.chronicle,
      inventoryHighlights,
      locationName: snapshot.location?.name ?? 'Unknown Location',
      locationSummary: snapshot.location,
      skillHighlights,
      transcript,
    };
  }

  async #generateChronicleStorySummary(
    context: SummaryContext,
    event: ChronicleClosureEvent
  ): Promise<void> {
    const result = await this.#generateText({
      context,
      maxOutputTokens: 550,
      operation: 'chronicle-closer.story',
      prompt: buildChronicleStoryPrompt(context),
    });
    const summary = result.text.trim();
    if (summary.length === 0) {
      throw new Error('Chronicle story generation returned an empty response.');
    }
    const recorded = await this.#chronicleStore.commitClosureSummary({
      chronicleId: context.chronicle.id,
      entry: this.#buildEntry({
        event,
        kind: 'chronicle_story',
        providerId: result.response.providerId,
        requestId: result.response.requestId,
        summary,
      }),
    });
    if (recorded) {
      log('info', 'chronicle-closer.story-recorded', {
        chronicleId: context.chronicle.id,
      });
    }
  }

  async #generateCharacterBio(
    context: SummaryContext,
    event: ChronicleClosureEvent
  ): Promise<void> {
    if (context.character === null) {
      return;
    }
    const result = await this.#generateText({
      context,
      maxOutputTokens: 150,
      operation: 'chronicle-closer.character-impact',
      prompt: buildCharacterImpactPrompt(context),
    });
    const summary = sanitizeSentence(result.text);
    if (summary.length === 0) {
      throw new Error('Character impact generation returned an empty response.');
    }
    const bio = [context.character.bio?.trim(), summary].filter(Boolean).join('\n\n');
    const recorded = await this.#chronicleStore.commitClosureSummary({
      character: { ...context.character, bio },
      chronicleId: context.chronicle.id,
      entry: this.#buildEntry({
        event,
        kind: 'character_bio',
        providerId: result.response.providerId,
        requestId: result.response.requestId,
        summary,
      }),
    });
    if (recorded) {
      log('info', 'chronicle-closer.character-bio-recorded', {
        characterId: context.character.id,
        chronicleId: context.chronicle.id,
      });
    }
  }

  async #generateText(input: {
    context: SummaryContext;
    maxOutputTokens: number;
    operation: string;
    prompt: string;
  }): Promise<{ response: LLMResponse; text: string }> {
    const model = await this.#modelConfigStore.getModelForCategory(
      'prose',
      input.context.chronicle.playerId
    );
    const request: LLMRequest = {
      input: [
        {
          content: [{ text: input.prompt, type: 'input_text' }],
          role: 'user',
        },
      ],
      instructions: 'Produce only the requested narrative text.',
      maxOutputTokens: input.maxOutputTokens,
      metadata: {
        chronicleId: input.context.chronicle.id,
        operation: input.operation,
        playerId: input.context.chronicle.playerId,
      },
      model,
      reasoningEffort: 'low',
    };
    const response = await this.#llm.generate(request, 'string');
    if (typeof response.message !== 'string') {
      throw new Error(`${input.operation} returned a non-text response.`);
    }
    return { response, text: response.message };
  }

  #buildEntry(input: {
    event: ChronicleClosureEvent;
    kind: ImplementedSummaryKind;
    providerId: string;
    requestId: string;
    summary: string;
  }): ChronicleSummaryEntry {
    return {
      createdAt: input.event.requestedAt,
      id: `${input.event.chronicleId}:${input.kind}`,
      kind: input.kind,
      metadata: {
        provider: input.providerId,
        requestId: input.requestId,
        turnSequence: input.event.turnSequence,
      },
      summary: input.summary,
    };
  }
}

export { ChronicleClosureProcessor };
