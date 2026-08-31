import { type CatalogModel, MODEL_CATALOG, renderBlock } from '@glass-frontier/app';
import {
  type IntentType,
  type EncyclopediaUsageRecord,
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
import { z } from 'zod';

import { PromptComposer } from '../prompts/prompts';
import { getSceneTypeDefinition } from '../scenes/sceneRegistry';
import type { GraphContext } from '../types';
import {
  agentTemplateFor,
  COMPOSE_INSTRUCTIONS,
  EVALUATOR_INSTRUCTIONS,
  EXTRACT_INSTRUCTIONS,
  SEARCH_INSTRUCTIONS,
  searchFocus,
} from './policy';
import { runResearch } from './research';
import {
  describeError,
  EMPTY_BRIEF,
  type ScoutOutcome,
  type ScoutProgress,
} from './scoutResult';
import { buildSeedPack, renderSeedPack } from './seedPack';
import { createProseAgentTools } from './tools';
import { ToolSession } from './toolSession';

/** Steps per search invocation; the evaluator, not the cap, ends research. */
const SEARCH_MAX_STEPS = 2;
/**
 * Headroom, not length. Every one of these used to be a real budget, and a
 * reasoning model spends output tokens on reasoning before it writes anything
 * — so a 1,000-token evaluator ceiling meant kimi-k2-thinking hit `max_tokens`
 * mid-thought and returned no tool call, three retries deep, on every turn of
 * The train that runs on Warm Argument's ore. The registry clamps these to
 * whatever each model actually allows; how long the answer should be is stated
 * in the instructions, where a model can read it.
 */
const SEARCH_MAX_OUTPUT_TOKENS = 16_000;
const EVALUATOR_MAX_OUTPUT_TOKENS = 16_000;
const COMPOSE_MAX_OUTPUT_TOKENS = 16_000;
const EXTRACT_MAX_OUTPUT_TOKENS = 16_000;
const PROSE_MAX_OUTPUT_TOKENS = 16_000;
const SCOUT_REASONING_EFFORT = 'low';
const PROSE_REASONING_EFFORT = 'low';

/**
 * The evaluator's verdict: research is sufficient, or these are the gaps.
 * Gaps name missing information, and the next search invocation decides how
 * to reach it — the evaluator judges, the searcher retrieves.
 */
const RetrievalVerdict = z.object({
  gaps: z.array(z.string().min(1)).max(4).default([])
    .describe(
      'What the brief cannot be written without, as information, not tool '
      + 'calls. Empty when status is sufficient.'
    ),
  status: z.enum(['sufficient', 'continue'])
    .describe(
      '`continue` when another round of retrieval is needed, `sufficient` '
      + 'when the brief can be written from what is already retrieved.'
    ),
});
type RetrievalVerdict = z.infer<typeof RetrievalVerdict>;

export type ProseAgentOutcome = {
  brief: TurnBrief;
  /** The research threw and this narration was written from an empty brief. */
  briefFailed: boolean;
  costUsd: number;
  prose: string;
  /** The writer's audit id, so the turn trace still points at a real record. */
  requestId: string;
  sidecar: ProseSidecarEntry[];
  referenceUsage: EncyclopediaUsageRecord[];
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

const resolveCatalogModel = (modelId: string, purpose: string): CatalogModel => {
  const model = MODEL_CATALOG.models.find((entry) => entry.modelId === modelId);
  if (model === undefined) {
    throw new Error(`${purpose} model ${modelId} is not in the model catalog.`);
  }
  return model;
};

const resolveProseModel = async (
  context: GraphContext,
  playerId: string,
  overrideModelId?: string
): Promise<CatalogModel> => {
  const modelId = overrideModelId
    ?? await context.modelConfigStore.getModelForCategory('prose', playerId);
  return resolveCatalogModel(modelId, 'Prose');
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

const sumUsage = (entries: TokenUsage[]): TokenUsage => {
  const total: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  for (const entry of entries) {
    total.inputTokens += entry.inputTokens;
    total.outputTokens += entry.outputTokens;
    total.totalTokens += entry.totalTokens;
  }
  return total;
};

const userMessage = (text: string): {
  content: Array<{ text: string; type: 'input_text' }>;
  role: 'user';
} => ({ content: [{ text, type: 'input_text' }], role: 'user' });

/**
 * Slugs the brief names are resolved against what the research actually
 * opened, and anything named but never read is dropped: a sidecar is a record
 * of what was retrieved, not of what was imagined.
 */
const provenanceFiltered = (
  context: GraphContext,
  entries: TurnBrief['references'],
  session: ToolSession
): { referenceUsage: EncyclopediaUsageRecord[]; sidecar: ProseSidecarEntry[] } => {
  const referenceUsage: EncyclopediaUsageRecord[] = [];
  const sidecar: ProseSidecarEntry[] = [];
  for (const { emergentTags, slug, usage } of entries) {
    const served = session.resolveServed(slug);
    if (served?.atlasEntityId !== undefined && served.atlasSlug !== undefined) {
      sidecar.push({
        emergentTags,
        entityId: served.atlasEntityId,
        entitySlug: served.atlasSlug,
        usage,
      });
      continue;
    }
    if (served !== undefined && slug.startsWith('encyclopedia:')) {
      referenceUsage.push({
        role: usage === 'central' ? 'interaction' : 'texture',
        slug,
      });
      continue;
    }
    log('warn', 'prose-agent.sidecar.unserved_reference', {
      chronicleId: context.chronicleId,
      slug,
      turnId: context.turnId,
    });
  }
  return { referenceUsage, sidecar };
};

/**
 * Everything the research judged, as the writer's one authored block, plus
 * what the world did before the dice. The writer is not obliged to show the
 * world's move — the world does what it does, the narration shows what the
 * camera catches — so a quiet turn stays quiet and lands later.
 *
 * `brief.scene` is absent here on purpose: it is the scout's proposed scene
 * state, read by `applySceneRead`, while the writer receives the scene's own
 * record with its clock intact.
 */
const renderBrief = (brief: TurnBrief, worldContent: string | undefined): string => renderBlock({
  character: brief.character,
  complication: brief.complication,
  history: brief.history,
  location: brief.location,
  present: brief.present,
  ...worldContent === undefined ? {} : { world: worldContent },
});

type ResearchTarget = {
  intentType: IntentType;
  model: CatalogModel;
  playerId: string;
  session: ToolSession;
  task: string;
};

/** The searcher's message: the turn, then what is held and what is missing. */
const searchMessage = (target: ResearchTarget, gaps: string[]): string => {
  if (gaps.length === 0) {
    return target.task;
  }
  return `${target.task}\n\n### RETRIEVED\n${target.session.renderRecord()}`
    + `\n\n### GAPS\n${gaps.map((gap) => `- ${gap}`).join('\n')}`;
};

const runSearch = async (
  context: GraphContext,
  deps: ProseAgentDeps,
  target: ResearchTarget,
  gaps: string[]
): Promise<{ stepCount: number; usage: TokenUsage }> => deps.agentLoop.run({
  instructions: `${SEARCH_INSTRUCTIONS}\n\n${searchFocus(target.intentType)}`,
  maxOutputTokens: SEARCH_MAX_OUTPUT_TOKENS,
  maxSteps: SEARCH_MAX_STEPS,
  messages: [{ content: searchMessage(target, gaps), role: 'user' }],
  metadata: callMetadata(context, deps, target.playerId, 'scout'),
  model: target.model,
  onStep: stepListener(target.session, deps),
  player: context.llmPlayer,
  reasoningEffort: SCOUT_REASONING_EFFORT,
  tools: createProseAgentTools({ context, session: target.session }),
});

/** The evaluator judges from the raw record, never the searcher's account. */
const evaluateResearch = async (
  context: GraphContext,
  deps: ProseAgentDeps,
  target: ResearchTarget
): Promise<{ usage: TokenUsage; verdict: RetrievalVerdict }> => {
  const response = await context.llm.generateStructured(
    {
      input: [userMessage(
        `${target.task}\n\n### RETRIEVED\n${target.session.renderRecord()}`
      )],
      instructions: EVALUATOR_INSTRUCTIONS,
      maxOutputTokens: EVALUATOR_MAX_OUTPUT_TOKENS,
      metadata: callMetadata(context, deps, target.playerId, 'scout-evaluator'),
      model: target.model.modelId,
      player: context.llmPlayer,
      reasoningEffort: SCOUT_REASONING_EFFORT,
    },
    RetrievalVerdict,
    'retrieval_verdict_schema'
  );
  return { usage: response.usage, verdict: response.data };
};

/** The brief as prose in labeled sections — the format the models write well. */
const composeBrief = async (
  context: GraphContext,
  deps: ProseAgentDeps,
  target: ResearchTarget
): Promise<{ text: string; usage: TokenUsage }> => {
  const response = await context.llm.generate({
    input: [userMessage(
      `${target.task}\n\n### RETRIEVED\n${target.session.renderRecord()}`
    )],
    instructions: COMPOSE_INSTRUCTIONS,
    maxOutputTokens: COMPOSE_MAX_OUTPUT_TOKENS,
    metadata: callMetadata(context, deps, target.playerId, 'scout-composer'),
    model: target.model.modelId,
    player: context.llmPlayer,
    reasoningEffort: SCOUT_REASONING_EFFORT,
  }, 'string');
  if (typeof response.message !== 'string' || response.message.trim().length === 0) {
    throw new Error('The composer returned no brief text.');
  }
  return { text: response.message, usage: response.usage };
};

/** Prose into schema: the low-reasoning half, on the classification model. */
const extractBrief = async (
  context: GraphContext,
  deps: ProseAgentDeps,
  target: ResearchTarget,
  briefText: string
): Promise<{ brief: TurnBrief; costUsd: number; usage: TokenUsage }> => {
  const modelId = await context.modelConfigStore.getModelForCategory(
    'classification',
    target.playerId
  );
  const model = resolveCatalogModel(modelId, 'Classification');
  const response = await context.llm.generateStructured(
    {
      input: [userMessage(`### BRIEF-TEXT\n${briefText}`)],
      instructions: EXTRACT_INSTRUCTIONS,
      maxOutputTokens: EXTRACT_MAX_OUTPUT_TOKENS,
      metadata: callMetadata(context, deps, target.playerId, 'scout-extractor'),
      model: model.modelId,
      player: context.llmPlayer,
      reasoningEffort: SCOUT_REASONING_EFFORT,
    },
    TurnBrief,
    'turn_brief_schema'
  );
  return {
    brief: response.data,
    costUsd: calculateActualCostUsd(model, response.usage),
    usage: response.usage,
  };
};

/**
 * The research loop: search, then let a separate invocation judge whether
 * the record suffices. The searcher never decides that research is complete —
 * combining "find more" and "decide whether more is needed" in one call made
 * stopping the cheapest answer, and both models took it at two or three
 * calls. The harness owns the hard limits: iteration cap and token budget.
 */
/** The whole path a brief takes when nothing throws. */
const composeAndExtract = async (
  context: GraphContext,
  deps: ProseAgentDeps,
  target: ResearchTarget,
  progress: ScoutProgress
): Promise<ScoutOutcome> => {
  const research = await runResearch(context, {
    evaluate: async () => evaluateResearch(context, deps, target),
    search: async (gaps) => runSearch(context, deps, target, gaps),
    spentTokens: () => target.session.spentTokens,
  });
  progress.stepCount = research.stepCount;
  progress.usages.push(...research.usages);

  progress.stage = 'compose';
  const composed = await composeBrief(context, deps, target);
  progress.usages.push(composed.usage);

  progress.stage = 'extract';
  const extracted = await extractBrief(context, deps, target, composed.text);
  const proseUsage = sumUsage(progress.usages);
  return {
    brief: extracted.brief,
    briefFailed: false,
    costUsd: calculateActualCostUsd(target.model, proseUsage) + extracted.costUsd,
    session: target.session,
    stepCount: progress.stepCount,
    usage: sumUsage([proseUsage, extracted.usage]),
  };
};

const runScout = async (
  context: GraphContext,
  deps: ProseAgentDeps,
  input: { intentType: IntentType; model: CatalogModel; playerId: string }
): Promise<ScoutOutcome> => {
  const { intentType, model, playerId } = input;
  const pack = await buildSeedPack(context);
  const session = new ToolSession({ seedReferences: pack.seedReferences });
  const target: ResearchTarget = {
    intentType,
    model,
    playerId,
    session,
    task: renderSeedPack(pack, context.playerMessage.content),
  };
  // `progress` is held outside the try so a failure can still report the
  // research that did happen. Reporting zero steps and zero cost made a thrown
  // scout look like one that chose not to search, which is what made kimi's
  // panel responses unreadable across a whole chronicle.
  const progress: ScoutProgress = { stage: 'research', stepCount: 0, usages: [] };
  try {
    return await composeAndExtract(context, deps, target, progress);
  } catch (error) {
    const usage = sumUsage(progress.usages);
    log('warn', 'prose-agent.scout.no_brief', {
      calls: String(session.callCount),
      chronicleId: context.chronicleId,
      detail: describeError(error),
      modelId: model.modelId,
      stage: progress.stage,
      stepCount: String(progress.stepCount),
      turnId: context.turnId,
    });
    return {
      brief: EMPTY_BRIEF,
      briefFailed: true,
      // The tokens were spent whether or not a brief came back.
      costUsd: calculateActualCostUsd(model, usage),
      session,
      stepCount: progress.stepCount,
      usage,
    };
  }
};

const writeProse = async (
  context: GraphContext,
  deps: ProseAgentDeps,
  target: {
    brief: TurnBrief;
    model: CatalogModel;
    playerId: string;
    templateId: PromptTemplateId;
  }
): Promise<{ prose: string; requestId: string; usage: TokenUsage }> => {
  const { brief, model, playerId, templateId } = target;
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
    model: model.modelId,
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
 * One turn in stages: research retrieves under an evaluator's judgment, the
 * composer writes the brief, the extractor structures it, and the writer
 * narrates from the brief with no tools, no index, and no retrieval policy
 * competing for its attention.
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
  const scout = await runScout(context, deps, {
    intentType: intent.intentType,
    model,
    playerId,
  });
  const written = await writeProse(context, deps, {
    brief: scout.brief,
    model,
    playerId,
    templateId: agentTemplateFor(intent.intentType),
  });
  const usage = sumUsage([scout.usage, written.usage]);
  const provenance = provenanceFiltered(context, scout.brief.references, scout.session);
  return {
    brief: scout.brief,
    briefFailed: scout.briefFailed,
    costUsd: scout.costUsd + calculateActualCostUsd(model, written.usage),
    prose: written.prose,
    referenceUsage: provenance.referenceUsage,
    requestId: written.requestId,
    sidecar: provenance.sidecar,
    stepCount: scout.stepCount,
    usage,
  };
};
