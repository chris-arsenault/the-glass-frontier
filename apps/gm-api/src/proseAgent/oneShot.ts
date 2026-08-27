import { MODEL_CATALOG } from '@glass-frontier/app';
import type { IntentType, ProseAlternate, PromptTemplateId } from '@glass-frontier/dto';
import { calculateActualCostUsd } from '@glass-frontier/llm-client';

import { PromptComposer } from '../prompts/prompts';
import type { GraphContext } from '../types';
import { buildOneShotContext } from './oneShotContext';

const ONE_SHOT_MAX_OUTPUT_TOKENS = 2_000;
const ONE_SHOT_REASONING_EFFORT = 'low';

const ONE_SHOT_TEMPLATES = new Map<IntentType, PromptTemplateId>([
  ['action', 'action-resolver'],
  ['clarification', 'clarification-responder'],
  ['inquiry', 'inquiry-describer'],
  ['planning', 'planning-narrator'],
  ['possibility', 'possibility-advisor'],
  ['reflection', 'reflection-weaver'],
  ['wrap', 'wrap-resolver'],
]);

/**
 * The retrieval-free narrator: the comparison the panel exists to draw.
 *
 * It runs on the same model the canonical turn used and differs from it in one
 * thing only — how the world reaches the page. The agentic path searches,
 * judges what it is missing, searches again, and composes a brief; this one is
 * handed everything up front by a graph walk and a vector search and writes in
 * a single call. Holding the model fixed is what makes the difference
 * attributable to retrieval instead of to Nova.
 *
 * It builds its own context here rather than in the pipeline: the live turn
 * stopped selecting entities up front, and this shadow should not put that
 * cost back on every turn for a response that never drives the story.
 */
/** The primary unless a slot names another: the panel pairs each model with itself. */
const resolveOneShotModel = async (
  context: GraphContext,
  overrideModelId?: string
): Promise<NonNullable<(typeof MODEL_CATALOG.models)[number]>> => {
  const modelId = overrideModelId
    ?? await context.modelConfigStore.getModelForCategory(
      'prose', context.chronicleState.chronicle.playerId
    );
  const model = MODEL_CATALOG.models.find((entry) => entry.modelId === modelId);
  if (model === undefined) {
    throw new Error(`One-shot model ${modelId} is not in the model catalog.`);
  }
  return model;
};

const resolveTemplate = (intentType: IntentType): PromptTemplateId => {
  const templateId = ONE_SHOT_TEMPLATES.get(intentType);
  if (templateId === undefined) {
    throw new Error(`No one-shot template for intent type ${intentType}.`);
  }
  return templateId;
};

export const runOneShotProse = async (
  context: GraphContext,
  modelIdOverride?: string
): Promise<ProseAlternate> => {
  const intent = context.playerIntent;
  if (intent === undefined) {
    throw new Error('The one-shot narrator requires a classified player intent.');
  }
  const templateId = resolveTemplate(intent.intentType);
  const model = await resolveOneShotModel(context, modelIdOverride);
  const retrieved = await buildOneShotContext(context);
  const withEntities: GraphContext = {
    ...context,
    entityContext: retrieved.entityContext,
    entityRelationships: retrieved.relationships,
  };
  const prompt = await new PromptComposer(context.templates).buildPrompt(
    templateId, withEntities
  );
  const narration = await context.llm.generate({
    ...prompt,
    maxOutputTokens: ONE_SHOT_MAX_OUTPUT_TOKENS,
    metadata: {
      chronicleId: context.chronicleId,
      nodeId: templateId,
      panel: 'one-shot',
      playerId: context.chronicleState.chronicle.playerId,
      turnId: context.turnId,
      turnSequence: String(context.turnSequence),
    },
    model: model.modelId,
    player: context.llmPlayer,
    reasoningEffort: ONE_SHOT_REASONING_EFFORT,
  }, 'string');
  if (typeof narration.message !== 'string') {
    throw new Error('The one-shot narrator returned a non-text narration.');
  }
  return {
    // The one-shot has no brief to lose: its world arrives whole, or the whole
    // call throws.
    briefFailed: false,
    costUsd: calculateActualCostUsd(model, narration.usage),
    modelId: `${model.modelId} (one-shot)`,
    prose: narration.message.trim(),
    sidecar: [],
    stepCount: 1,
    totalTokens: narration.usage.totalTokens,
  };
};
