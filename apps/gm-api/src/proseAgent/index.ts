import { MODEL_CATALOG } from '@glass-frontier/app';
import {
  type IntentType,
  type PromptTemplateId,
  type ProseSidecarEntry,
  TurnBrief,
} from '@glass-frontier/dto';
import {
  type AgentLoopClient,
  type AgentLoopStep,
  calculateActualCostUsd,
  type TokenUsage,
} from '@glass-frontier/llm-client';
import { log } from '@glass-frontier/utils';

import { renderBlock } from '../prompts/blockRender';
import { PromptComposer } from '../prompts/prompts';
import { getSceneTypeDefinition } from '../scenes/sceneRegistry';
import type { GraphContext } from '../types';
import { agentTemplateFor, SCOUT_INSTRUCTIONS, scoutFocus } from './policy';
import { buildSeedPack, renderSeedPack } from './seedPack';
import { createProseAgentTools } from './tools';
import { ToolSession } from './toolSession';

export const PROSE_AGENT_MAX_STEPS = 5;
const SCOUT_MAX_OUTPUT_TOKENS = 2_000;
const PROSE_MAX_OUTPUT_TOKENS = 2_000;
const SCOUT_REASONING_EFFORT = 'low';
const PROSE_REASONING_EFFORT = 'low';

export type ProseAgentOutcome = {
  brief: TurnBrief;
  costUsd: number;
  prose: string;
  /** The writer's audit id, so the turn trace still points at a real record. */
  requestId: string;
  sidecar: ProseSidecarEntry[];
  stepCount: number;
  usage: TokenUsage;
};

export type ProseAgentDeps = {
  agentLoop: AgentLoopClient;
  onStep?: (step: AgentLoopStep) => void;
  /** Bake-off override: run on this catalog model instead of the player's prose config. */
  modelId?: string;
  /** Extra audit metadata (e.g. shadow labels), merged into every call's record. */
  metadata?: Record<string, string>;
};

const resolveProseModel = async (
  context: GraphContext,
  playerId: string,
  overrideModelId?: string
): Promise<NonNullable<(typeof MODEL_CATALOG.models)[number]>> => {
  const modelId = overrideModelId
    ?? await context.modelConfigStore.getModelForCategory('prose', playerId);
  const model = MODEL_CATALOG.models.find((entry) => entry.modelId === modelId);
  if (model === undefined) {
    throw new Error(`Prose model ${modelId} is not in the model catalog.`);
  }
  return model;
};

const callMetadata = (
  context: GraphContext,
  deps: ProseAgentDeps,
  playerId: string,
  nodeId: string
): Record<string, string> => ({
  ...deps.metadata,
  chronicleId: context.chronicleId,
  nodeId,
  playerId,
  turnId: context.turnId,
  turnSequence: String(context.turnSequence),
});

const stepListener = (session: ToolSession, deps: ProseAgentDeps) =>
  (step: AgentLoopStep): void => {
    session.noteStep(step.stepNumber);
    deps.onStep?.(step);
  };

/**
 * Slugs the scout names are resolved against what it actually opened, and
 * anything it names but never read is dropped: a sidecar is a record of what
 * was retrieved, not of what was imagined. This is the only source of entity
 * usage now — the judge that used to re-read the narration and score the
 * offered list is gone, along with its LLM call.
 */
const provenanceFiltered = (
  context: GraphContext,
  entries: TurnBrief['entities'],
  session: ToolSession
): ProseSidecarEntry[] => entries.flatMap(({ entitySlug, ...entry }) => {
  const served = session.resolveServed(entitySlug);
  if (served !== undefined) {
    return [{ ...entry, entityId: served.id, entitySlug: served.slug }];
  }
  log('warn', 'prose-agent.sidecar.unserved_entity', {
    chronicleId: context.chronicleId,
    entitySlug,
    turnId: context.turnId,
  });
  return [];
});

/**
 * Everything the scout learned, as the writer's one world-facing block, plus
 * what the world did before the dice. The writer is not obliged to show the
 * world's move — the world does what it does, the narration shows what the
 * camera catches — so a quiet turn stays quiet and lands later.
 */
const renderBrief = (brief: TurnBrief, worldContent: string | undefined): string => renderBlock({
  complication: brief.complication,
  material: brief.material,
  present: brief.present,
  scene: brief.scene,
  ...worldContent === undefined ? {} : { world: worldContent },
});

const runScout = async (
  context: GraphContext,
  deps: ProseAgentDeps,
  playerId: string,
  intentType: IntentType
): Promise<{ brief: TurnBrief; session: ToolSession; stepCount: number; usage: TokenUsage }> => {
  const pack = await buildSeedPack(context);
  const session = new ToolSession({
    maxSteps: PROSE_AGENT_MAX_STEPS,
    seedEntities: pack.seedEntities,
  });
  const model = await resolveProseModel(context, playerId, deps.modelId);
  const result = await deps.agentLoop.run({
    finishToolName: 'submit_brief',
    instructions: `${SCOUT_INSTRUCTIONS}\n\n${scoutFocus(intentType)}`,
    maxOutputTokens: SCOUT_MAX_OUTPUT_TOKENS,
    maxSteps: PROSE_AGENT_MAX_STEPS,
    messages: [{
      content: renderSeedPack(pack, context.playerMessage.content),
      role: 'user',
    }],
    metadata: callMetadata(context, deps, playerId, 'scout'),
    model,
    onStep: stepListener(session, deps),
    player: context.llmPlayer,
    reasoningEffort: SCOUT_REASONING_EFFORT,
    tools: createProseAgentTools({ context, session }),
  });
  return {
    brief: TurnBrief.parse(result.finishToolInput),
    session,
    stepCount: result.stepCount,
    usage: result.usage,
  };
};

const writeProse = async (
  context: GraphContext,
  deps: ProseAgentDeps,
  target: { brief: TurnBrief; playerId: string; templateId: PromptTemplateId }
): Promise<{ prose: string; requestId: string; usage: TokenUsage }> => {
  const { brief, playerId, templateId } = target;
  const composer = new PromptComposer(context.templates);
  const prompt = await composer.buildPrompt(templateId, context);
  const scenePolicy = context.effectiveScene === null
    ? ''
    : `\n\n## Active scene policy\n\n${await context.templates.render(
      getSceneTypeDefinition(context.effectiveScene.type).promptTemplateId, {}
    )}`;
  const narration = await context.llm.generate({
    ...prompt,
    input: [...prompt.input, {
      content: [{
        text: `### BRIEF\n${renderBrief(brief, context.worldContent)}`,
        type: 'input_text' as const,
      }],
      role: 'developer' as const,
    }],
    instructions: `${prompt.instructions}${scenePolicy}`,
    maxOutputTokens: PROSE_MAX_OUTPUT_TOKENS,
    metadata: callMetadata(context, deps, playerId, templateId),
    model: (await resolveProseModel(context, playerId, deps.modelId)).modelId,
    player: context.llmPlayer,
    reasoningEffort: PROSE_REASONING_EFFORT,
  }, 'string');
  if (typeof narration.message !== 'string') {
    throw new Error('The writer returned a non-text narration.');
  }
  return {
    prose: narration.message.trim(),
    requestId: narration.requestId,
    usage: narration.usage,
  };
};

/**
 * One turn in two stages: the scout retrieves and briefs, the writer narrates
 * from the brief with no tools, no index, and no retrieval policy competing
 * for its attention.
 */
export const runProseAgent = async (
  context: GraphContext,
  deps: ProseAgentDeps
): Promise<ProseAgentOutcome> => {
  const intent = context.playerIntent;
  if (intent === undefined) {
    throw new Error('Prose agent requires a classified player intent.');
  }
  const playerId = context.chronicleState.chronicle.playerId;
  const model = await resolveProseModel(context, playerId, deps.modelId);
  const scout = await runScout(context, deps, playerId, intent.intentType);
  const written = await writeProse(context, deps, {
    brief: scout.brief,
    playerId,
    templateId: agentTemplateFor(intent.intentType),
  });
  const usage: TokenUsage = {
    inputTokens: scout.usage.inputTokens + written.usage.inputTokens,
    outputTokens: scout.usage.outputTokens + written.usage.outputTokens,
    totalTokens: scout.usage.totalTokens + written.usage.totalTokens,
  };
  return {
    brief: scout.brief,
    costUsd: calculateActualCostUsd(model, usage),
    prose: written.prose,
    requestId: written.requestId,
    sidecar: provenanceFiltered(context, scout.brief.entities, scout.session),
    stepCount: scout.stepCount,
    usage,
  };
};
