import { MODEL_CATALOG } from '@glass-frontier/app';
import {
  type IntentType,
  type PromptTemplateId,
  type ProseAgentSidecarEntry,
  ProseAgentResult,
} from '@glass-frontier/dto';
import {
  type AgentLoopClient,
  type AgentLoopStep,
  calculateActualCostUsd,
  type TokenUsage,
} from '@glass-frontier/llm-client';
import { log } from '@glass-frontier/utils';

import { getSceneTypeDefinition } from '../scenes/sceneRegistry';
import type { GraphContext } from '../types';
import {
  agentTemplateFor,
  HISTORY_POLICY,
  PLAIN_REGISTER_POLICY,
  RETRIEVAL_POLICY,
  sufficiencyChecklist,
} from './policy';
import { buildSeedPack, renderSeedPack } from './seedPack';
import { createProseAgentTools } from './tools';
import { ToolSession } from './toolSession';

export const PROSE_AGENT_MAX_STEPS = 5;
const PROSE_AGENT_MAX_OUTPUT_TOKENS = 4_000;
const PROSE_AGENT_REASONING_EFFORT = 'low';

export type ProseAgentOutcome = {
  costUsd: number;
  prose: string;
  sidecar: ProseAgentSidecarEntry[];
  stepCount: number;
  usage: TokenUsage;
};

export type ProseAgentDeps = {
  agentLoop: AgentLoopClient;
  onStep?: (step: AgentLoopStep) => void;
  /** Bake-off override: run on this catalog model instead of the player's prose config. */
  modelId?: string;
  /** Bake-off variant: append the plain-register instruction. */
  plainRegister?: boolean;
  /** Extra audit metadata (e.g. shadow labels), merged into every call's record. */
  metadata?: Record<string, string>;
};

const buildInstructions = async (
  context: GraphContext,
  intentType: IntentType,
  templateId: PromptTemplateId,
  plainRegister: boolean
): Promise<string> => {
  const sections: string[] = [await context.templates.render(templateId, {})];
  sections.push(RETRIEVAL_POLICY);
  sections.push(`## Sufficiency\n\n${sufficiencyChecklist(intentType)}\n${HISTORY_POLICY}`);
  if (plainRegister) {
    sections.push(PLAIN_REGISTER_POLICY);
  }
  if (context.effectiveScene !== null) {
    const sceneTemplateId = getSceneTypeDefinition(context.effectiveScene.type).promptTemplateId;
    sections.push(`## Active scene policy\n\n${await context.templates.render(sceneTemplateId, {})}`);
  }
  return sections.join('\n\n');
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

const loopMetadata = (
  context: GraphContext,
  deps: ProseAgentDeps,
  playerId: string,
  templateId: PromptTemplateId
): Record<string, string> => ({
  ...deps.metadata,
  chronicleId: context.chronicleId,
  nodeId: templateId,
  playerId,
  turnId: context.turnId,
  turnSequence: String(context.turnSequence),
});

const stepListener = (session: ToolSession, deps: ProseAgentDeps) =>
  (step: AgentLoopStep): void => {
    session.noteStep(step.stepNumber);
    deps.onStep?.(step);
  };

const provenanceFiltered = (
  context: GraphContext,
  entries: ProseAgentSidecarEntry[],
  served: ReadonlySet<string>
): ProseAgentSidecarEntry[] => entries.filter((entry) => {
  if (served.has(entry.entityId)) {
    return true;
  }
  log('warn', 'prose-agent.sidecar.unserved_entity', {
    chronicleId: context.chronicleId,
    entityId: entry.entityId,
    turnId: context.turnId,
  });
  return false;
});

/**
 * Runs one agentic prose turn: seed pack in, retrieval rounds, prose plus a
 * provenance-checked entity sidecar out. Reads the same GraphContext the
 * one-shot prose node reads; writes nothing.
 */
export const runProseAgent = async (
  context: GraphContext,
  deps: ProseAgentDeps
): Promise<ProseAgentOutcome> => {
  const intent = context.playerIntent;
  if (intent === undefined) {
    throw new Error('Prose agent requires a classified player intent.');
  }
  const templateId = agentTemplateFor(intent.intentType);
  const playerId = context.chronicleState.chronicle.playerId;
  const model = await resolveProseModel(context, playerId, deps.modelId);
  const instructions = await buildInstructions(
    context, intent.intentType, templateId, deps.plainRegister ?? false
  );
  const pack = await buildSeedPack(context);
  const session = new ToolSession({
    maxSteps: PROSE_AGENT_MAX_STEPS,
    seedEntityIds: pack.seedEntityIds,
  });

  const result = await deps.agentLoop.run({
    finishToolName: 'submit_turn',
    instructions,
    maxOutputTokens: PROSE_AGENT_MAX_OUTPUT_TOKENS,
    maxSteps: PROSE_AGENT_MAX_STEPS,
    messages: [{
      content: renderSeedPack(pack, context.playerMessage.content),
      role: 'user',
    }],
    metadata: loopMetadata(context, deps, playerId, templateId),
    model,
    onStep: stepListener(session, deps),
    player: context.llmPlayer,
    reasoningEffort: PROSE_AGENT_REASONING_EFFORT,
    tools: createProseAgentTools({ context, session }),
  });

  const parsed = ProseAgentResult.parse(result.finishToolInput);
  return {
    costUsd: calculateActualCostUsd(model, result.usage),
    prose: parsed.prose,
    sidecar: provenanceFiltered(context, parsed.entities, session.servedEntityIds),
    stepCount: result.stepCount,
    usage: result.usage,
  };
};
