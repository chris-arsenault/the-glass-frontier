import { PRIMARY_SLOT } from '@glass-frontier/app';
import type { ProseAlternate } from '@glass-frontier/dto';
import type { AgentLoopClient } from '@glass-frontier/llm-client';
import { log } from '@glass-frontier/utils';

import type { GraphContext } from '../types';
import { runProseAgent } from './index';
import { runOneShotProse } from './oneShot';

/**
 * The comparison panel: every configured prose model, told twice.
 *
 * A player configures up to three prose models. The primary writes the turn
 * the story keeps; the other two write nothing canonical. Each configured
 * model then appears under both conditions — once having researched the world
 * through the agent loop, once handed it whole by a graph walk and a vector
 * search — so the panel answers two questions at once: what a different model
 * makes of this turn, and what retrieval is worth to it. Reading down a column
 * compares models; reading across a row prices retrieval.
 *
 * The primary's agentic response is the turn itself and is not repeated here,
 * so three models cost six generations and one model costs two. A slot left
 * empty is the off switch — there is no shadow to run and nothing to pay for.
 *
 * The panel used to be a second full research pass on Nova Pro, varying model
 * and context together and so measuring neither. Its evaluator never returned
 * `sufficient`, and it named gaps as bare nouns the searcher could not act on
 * and did not notice repeating, so it ran out its round cap every turn for
 * forty percent of the chronicle's input tokens.
 */
const agenticPanelist = async (
  context: GraphContext,
  agentLoop: AgentLoopClient,
  modelId: string
): Promise<ProseAlternate | null> => {
  const startedAt = Date.now();
  try {
    const outcome = await runProseAgent(context, {
      agentLoop,
      metadata: { panel: 'true', panelModel: modelId },
      modelId,
      onStep: (step) => {
        log('info', 'prose-agent.panel.step', {
          chronicleId: context.chronicleId,
          modelId,
          stepNumber: step.stepNumber,
          toolErrors: JSON.stringify(step.toolErrors),
          toolNames: step.toolNames.join(','),
          turnId: context.turnId,
        });
      },
    });
    log('info', 'prose-agent.panel.completed', {
      briefFailed: String(outcome.briefFailed),
      chronicleId: context.chronicleId,
      durationMs: Date.now() - startedAt,
      modelId,
      stepCount: String(outcome.stepCount),
      totalTokens: outcome.usage.totalTokens,
      turnId: context.turnId,
    });
    return {
      // Reading retrieval against no retrieval means knowing which of these
      // actually had a brief behind it.
      briefFailed: outcome.briefFailed,
      costUsd: outcome.costUsd,
      modelId,
      prose: outcome.prose,
      sidecar: outcome.sidecar,
      stepCount: outcome.stepCount,
      totalTokens: outcome.usage.totalTokens,
    };
  } catch (error) {
    return panelFailed(context, startedAt, modelId, error);
  }
};

const oneShotPanelist = async (
  context: GraphContext,
  modelId: string
): Promise<ProseAlternate | null> => {
  const startedAt = Date.now();
  try {
    const alternate = await runOneShotProse(context, modelId);
    log('info', 'prose-agent.panel.completed', {
      chronicleId: context.chronicleId,
      durationMs: Date.now() - startedAt,
      modelId: alternate.modelId,
      totalTokens: alternate.totalTokens,
      turnId: context.turnId,
    });
    return alternate;
  } catch (error) {
    return panelFailed(context, startedAt, `${modelId} (one-shot)`, error);
  }
};

const panelFailed = (
  context: GraphContext,
  startedAt: number,
  modelId: string,
  error: unknown
): null => {
  log('warn', 'prose-agent.panel.failed', {
    chronicleId: context.chronicleId,
    durationMs: Date.now() - startedAt,
    message: error instanceof Error ? error.message : 'unknown',
    modelId,
    turnId: context.turnId,
  });
  return null;
};

/**
 * The whole panel at once. A panelist failure drops that response only; the
 * panel never throws and never fails the turn.
 */
export const runProseAgentPanel = async (
  context: GraphContext,
  agentLoop: AgentLoopClient
): Promise<ProseAlternate[]> => {
  const configured = await context.modelConfigStore.listModelsForCategory(
    'prose', context.chronicleState.chronicle.playerId
  );
  const responses = await Promise.all(configured.flatMap((entry) => [
    oneShotPanelist(context, entry.modelId),
    // The primary's agentic response is the turn itself, already written.
    ...entry.slot === PRIMARY_SLOT ? [] : [agenticPanelist(context, agentLoop, entry.modelId)],
  ]));
  return responses.filter((response) => response !== null);
};
