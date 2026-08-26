import { MODEL_CATALOG } from '@glass-frontier/app';
import type { IntentType, ProseAlternate, PromptTemplateId } from '@glass-frontier/dto';
import { calculateActualCostUsd } from '@glass-frontier/llm-client';

import { buildEntityContext } from '../entity/entitySelector';
import { PromptComposer } from '../prompts/prompts';
import type { GraphContext } from '../types';

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
 * The pre-retrieval narrator, kept as the comparison the panel exists for.
 *
 * It is the only path left that receives a pre-selected slice of the world and
 * writes in one call, so it is the measure of whether retrieval is earning
 * anything. It builds its own entity context here rather than in the pipeline:
 * the live turn stopped selecting entities up front, and this shadow should
 * not put that cost back on every turn for a response that never drives the
 * story.
 */
export const runOneShotProse = async (
  context: GraphContext,
  modelId: string
): Promise<ProseAlternate> => {
  const intent = context.playerIntent;
  if (intent === undefined) {
    throw new Error('The one-shot narrator requires a classified player intent.');
  }
  const templateId = ONE_SHOT_TEMPLATES.get(intent.intentType);
  if (templateId === undefined) {
    throw new Error(`No one-shot template for intent type ${intent.intentType}.`);
  }
  const model = MODEL_CATALOG.models.find((entry) => entry.modelId === modelId);
  if (model === undefined) {
    throw new Error(`One-shot model ${modelId} is not in the model catalog.`);
  }
  const withEntities: GraphContext = {
    ...context,
    entityContext: await buildEntityContext(context),
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
    model: modelId,
    player: context.llmPlayer,
    reasoningEffort: ONE_SHOT_REASONING_EFFORT,
  }, 'string');
  if (typeof narration.message !== 'string') {
    throw new Error('The one-shot narrator returned a non-text narration.');
  }
  return {
    costUsd: calculateActualCostUsd(model, narration.usage),
    modelId: `${modelId} (one-shot)`,
    prose: narration.message.trim(),
    sidecar: [],
    stepCount: 1,
    totalTokens: narration.usage.totalTokens,
  };
};
