import type { LocationPlan, LocationSummary } from '@glass-frontier/dto';
import type { LocationGraphStore } from '@glass-frontier/persistence';
import { log } from '@glass-frontier/utils';
import { zodTextFormat } from 'openai/helpers/zod';
import { z, type ZodType } from 'zod';

import type { GraphContext, LangGraphLlmLike } from '../../types';
import type { GraphNode } from '../orchestrator';
import { composeLocationDeltaPrompt } from '../prompts/prompts';
import {
  type DeltaDecision,
  type PlanBuildResult,
  type PlannerContext,
  buildPlannerContext,
  buildPromptInput,
  decisionToPlan,
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
  readonly #graphStore: LocationGraphStore;

  constructor(graphStore: LocationGraphStore) {
    this.#graphStore = graphStore;
  }

  async execute(context: GraphContext): Promise<GraphContext> {
    const gmMessageContent = context.gmMessage?.content;
    const characterId = context.chronicle.character?.id;
    if (!this.#isRunnable(context, gmMessageContent, characterId)) {
      return context;
    }

    try {
      const planResult = await this.#buildPlan(context);
      if (planResult === null || planResult.plan.ops.length === 0) {
        return context;
      }
      console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%")
      console.log(planResult)
      console.log(planResult.plan.ops)
      console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%")
      if (planResult.applyImmediately) {
        const summary = await this.#applyPlanImmediately(context, planResult.plan);
        if (summary !== null) {
          return { ...context, locationPlan: null, locationSummary: summary };
        }
        return context;
      }
      return { ...context, locationPlan: planResult.plan };
    } catch (error) {
      log('warn', 'location-delta-node.failed', {
        chronicleId: context.chronicleId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return context;
    }
  }

  async #buildPlan(context: GraphContext): Promise<PlanBuildResult | null> {
    const plannerContext = await this.#resolvePlanContext(context);
    if (plannerContext === null) {
      return null;
    }

    const promptInput = buildPromptInput(
      plannerContext,
      context.gmMessage?.content ?? '',
      context.playerMessage?.content ?? ''
    );
    const prompt = await composeLocationDeltaPrompt(context.templates, promptInput);
    console.log(prompt)
    const decision = await this.#requestDecision(context, promptInput.currentId, prompt);
    console.log(decision)
    if (decision === null) {
      return null;
    }

    return decisionToPlan(plannerContext, decision);
  }

  async #resolvePlanContext(context: GraphContext): Promise<PlannerContext | null> {
    const locationId = context.chronicle.chronicle.locationId;
    const characterId = context.chronicle.character?.id;
    if (!isNonEmptyString(characterId) || !isNonEmptyString(locationId)) {
      return null;
    }
    const [graph, priorState] = await Promise.all([
      this.#graphStore.getLocationGraph(locationId),
      this.#graphStore.getLocationState(characterId),
    ]);
    return buildPlannerContext({
      characterId,
      chronicleId: context.chronicleId,
      graph,
      locationId,
      priorState,
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

  async #applyPlanImmediately(
    context: GraphContext,
    plan: LocationPlan
  ): Promise<LocationSummary | null> {
    const characterId = context.chronicle.character?.id;
    const locationId = context.chronicle.chronicle.locationId;
    if (!isNonEmptyString(characterId) || !isNonEmptyString(locationId)) {
      return null;
    }
    try {
      await this.#graphStore.applyPlan({
        characterId,
        locationId,
        plan,
      });
      const summary = await this.#graphStore.summarizeCharacterLocation({
        characterId,
        locationId,
      });
      if (summary !== null) {
        log('info', 'location-plan.immediate-applied', {
          chronicleId: context.chronicleId,
          notes: plan.notes,
          breadcrumb: summary.breadcrumb.map((entry) => entry.name),
        });
      }
      return summary;
    } catch (error) {
      log('warn', 'location-delta-node.apply-immediate-failed', {
        chronicleId: context.chronicleId,
        locationId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return null;
    }
  }
}
