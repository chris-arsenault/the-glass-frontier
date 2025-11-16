import type { WorldStateStoreV2 } from '@glass-frontier/worldstate';
import { log } from '@glass-frontier/utils';
import { zodTextFormat } from 'openai/helpers/zod';
import { z, type ZodType } from 'zod';

import type { GraphContext, LangGraphLlmLike } from '../../types';
import type { GraphNode } from '../orchestrator';
import { composeLocationDeltaPrompt } from '../prompts/prompts';
import {
  type DecisionResolution,
  type DeltaDecision,
  type PlannerContext,
  buildPlannerContext,
  buildPromptInput,
  resolveDecision,
} from './locationDeltaPlanner';

type Decision = DeltaDecision;

const decisionSchema: ZodType<DeltaDecision> = z.object({
  action: z
    .enum(['no_change', 'move', 'uncertain'])
    .describe('Whether to stay put, move to a specific place, or flag uncertainty.'),
  destination: z
    .string()
    .min(1)
    .describe('Name of the destination or best-known container.'),
  link: z
    .enum(['same', 'adjacent', 'inside', 'linked'])
    .describe('How the destination relates to the current anchor.'),
});

const LOCATION_DECISION_FORMAT = zodTextFormat(decisionSchema, 'location_delta_decision');
const LOCATION_DECISION_TEXT = {
  format: LOCATION_DECISION_FORMAT,
  verbosity: 'low' as const,
};
const CLASSIFIER_MODEL = 'gpt-5-nano';
const CLASSIFIER_REASONING = { reasoning: { effort: 'minimal' as const } };

const resolveClassifierLlm = (context: GraphContext): LangGraphLlmLike =>
  context.llmResolver?.(CLASSIFIER_MODEL) ?? context.llm;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export class LocationDeltaNode implements GraphNode {
  readonly id = 'location-delta';
  readonly #worldStateStore: WorldStateStoreV2;

  constructor(worldStateStore: WorldStateStoreV2) {
    this.#worldStateStore = worldStateStore;
  }

  async execute(context: GraphContext): Promise<GraphContext> {
    const gmMessageContent = context.gmMessage?.content;
    const characterId = context.chronicle.character?.id;
    if (!this.#isRunnable(context, gmMessageContent, characterId)) {
      return context;
    }

    try {
      const plannerContext = await this.#resolvePlannerContext(context);
      if (plannerContext === null) {
        return context;
      }
      const promptInput = buildPromptInput(
        plannerContext,
        context.gmMessage?.content ?? '',
        context.playerMessage?.content ?? ''
      );
      const prompt = await composeLocationDeltaPrompt(context.templates, promptInput);
      const decision = await this.#requestDecision(context, plannerContext.currentPlaceId, prompt);
      if (decision === null) {
        return context;
      }
      const resolution = resolveDecision(plannerContext, decision);
      return await this.#applyResolution(context, plannerContext, resolution);
    } catch (error) {
      log('warn', 'location-delta-node.failed', {
        chronicleId: context.chronicleId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return context;
    }
  }

  async #resolvePlannerContext(context: GraphContext): Promise<PlannerContext | null> {
    return buildPlannerContext({
      store: this.#worldStateStore,
      character: context.chronicle.character ?? null,
      locationSummary: context.chronicle.location ?? null,
      locationId: context.chronicle.chronicle.locationId,
    });
  }

  async #requestDecision(
    context: GraphContext,
    locationId: string,
    prompt: string
  ): Promise<Decision | null> {
    const classifier = resolveClassifierLlm(context);
    try {
      const llmResult = await classifier.generateJson({
        maxTokens: 400,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        reasoning: CLASSIFIER_REASONING.reasoning,
        temperature: 0.1,
        text: LOCATION_DECISION_TEXT,
      });
      const parsed = decisionSchema.safeParse(llmResult.json);
      if (!parsed.success) {
        log('warn', 'location-delta-node.invalid-json', {
          chronicleId: context.chronicleId,
          locationId,
          payload: llmResult.json,
          reason: 'schema_parse_failed',
        });
        return null;
      }
      return parsed.data;
    } catch (error) {
      log('warn', 'location-delta-node.invalid-json', {
        chronicleId: context.chronicleId,
        locationId,
        payload: 'structured_output_failure',
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return null;
    }
  }

  async #applyResolution(
    context: GraphContext,
    planner: PlannerContext,
    resolution: DecisionResolution
  ): Promise<GraphContext> {
    switch (resolution.kind) {
    case 'noop':
      return context;
    case 'uncertain':
      return { ...context, locationPlan: null };
    case 'move':
      return this.#applyMove(context, planner, resolution);
    default:
      return context;
    }
  }

  async #applyMove(
    context: GraphContext,
    planner: PlannerContext,
    resolution: Extract<DecisionResolution, { kind: 'move' }>
  ): Promise<GraphContext> {
    const timestamp = new Date().toISOString();
    const updatedState = await this.#worldStateStore.updateLocationState({
      characterId: planner.characterId,
      locationId: planner.locationId,
      placeId: resolution.target.placeId,
      breadcrumb: resolution.target.breadcrumb,
      certainty: 1,
      updatedAt: timestamp,
      metadata: { reason: 'location-delta-node' },
    });
    const updatedCharacter =
      context.chronicle.character === null || context.chronicle.character === undefined
        ? context.chronicle.character
        : {
            ...context.chronicle.character,
            locationState: {
              ...updatedState,
              breadcrumb: resolution.target.breadcrumb,
            },
          };
    log('info', 'location-delta-node.move-applied', {
      chronicleId: context.chronicleId,
      destination: resolution.target.name,
    });
    return {
      ...context,
      chronicle: {
        ...context.chronicle,
        character: updatedCharacter,
      },
      locationPlan: null,
      locationSummary: context.chronicle.location ?? null,
    };
  }

  #shouldApplyDelta(context: GraphContext): boolean {
    const type = context.resolvedIntentType ?? context.playerIntent?.intentType;
    return type === 'action' || type === 'planning';
  }

  #isRunnable(
    context: GraphContext,
    gmMessageContent?: string | null,
    characterId?: string | null
  ): boolean {
    return (
      context.failure !== true &&
      this.#shouldApplyDelta(context) &&
      isNonEmptyString(gmMessageContent) &&
      isNonEmptyString(characterId)
    );
  }
}
