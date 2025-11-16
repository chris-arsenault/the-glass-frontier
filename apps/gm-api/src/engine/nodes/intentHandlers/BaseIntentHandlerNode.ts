import type { Intent, TranscriptEntry } from '@glass-frontier/worldstate';
import { randomUUID } from 'node:crypto';

import type { GraphContext, GraphNode, GraphNodeResult } from '../../graphNode';
import type { IntentHandlerPrompt } from '../../prompts/intentHandlers';
import type { StructuredLlmClient } from '../structuredLlmClient';

type BaseHandlerConfig = {
  id: string;
  intentKind: NonNullable<Intent['intentType']>;
  advancesTimeline: boolean;
  worldDeltaTag?: string;
  temperature: number;
};

export abstract class BaseIntentHandlerNode implements GraphNode {
  readonly id: string;
  readonly #config: BaseHandlerConfig;
  readonly #llm: StructuredLlmClient;

  protected constructor(llm: StructuredLlmClient, config: BaseHandlerConfig) {
    this.id = config.id;
    this.#config = config;
    this.#llm = llm;
  }

  async execute(context: GraphContext): Promise<GraphNodeResult> {
    if (!this.#canHandle(context)) {
      return context;
    }
    const prompt: IntentHandlerPrompt = await this.buildPrompt(context);
    const narration: { text: string } | null = await this.#invoke(prompt, context);
    if (narration === null) {
      return { ...context, failure: true };
    }
    const transcript = this.#toTranscript(context, narration.text);
    const worldDeltaTags = this.#appendWorldDeltaTag(context.turnDraft.worldDeltaTags);
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    return {
      ...context,
      turnDraft: {
        ...context.turnDraft,
        advancesTimeline: this.#config.advancesTimeline,
        gmMessage: transcript,
        handlerId: this.id,
        resolvedIntentType: this.#config.intentKind,
        worldDeltaTags,
      },
    };
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  }

  #canHandle(context: GraphContext): boolean {
    const intent = context.turnDraft.playerIntent;
    if (context.failure || intent === undefined) {
      return false;
    }
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    const resolvedCandidate = context.turnDraft
      .resolvedIntentType as Intent['intentType'] | undefined;
    const resolvedType: Intent['intentType'] = resolvedCandidate ?? intent.intentType ?? 'action';
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    return resolvedType === this.#config.intentKind;
  }

  async #invoke(
    prompt: IntentHandlerPrompt,
    context: GraphContext
  ): Promise<{ text: string } | null> {
    try {
      return await this.#llm.generateStructured({
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        model: prompt.model,
        schema: prompt.schema,
        templateId: prompt.templateId,
        variables: prompt.variables,
      });
    } catch (error) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: `llm.${this.id}`,
      });
      return null;
    }
  }

  #toTranscript(context: GraphContext, text: string): TranscriptEntry {
    return {
      content: text,
      id: `intent-${this.id}-${context.chronicleId}-${context.turnSequence}-${randomUUID()}`,
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      role: 'gm',
    };
  }

  #appendWorldDeltaTag(existing?: string[]): string[] | undefined {
    if (this.#config.worldDeltaTag === undefined) {
      return existing;
    }
    const tags = new Set(existing ?? []);
    tags.add(this.#config.worldDeltaTag);
    return Array.from(tags);
  }

  protected abstract buildPrompt(context: GraphContext): Promise<IntentHandlerPrompt>;
}
