import type { ProseAlternate } from '@glass-frontier/dto';
import type { AgentLoopClient } from '@glass-frontier/llm-client';
import { log } from '@glass-frontier/utils';

import type { GraphContext } from '../types';
import { runProseAgent } from './index';
import { runOneShotProse } from './oneShot';

/**
 * The comparison panel. Claude now writes the canonical turn through the same
 * scout-and-writer path, so the panel exists to show what a cheaper model
 * makes of the identical brief; its responses are persisted for the client to
 * page through and never enter the story.
 *
 * Nova 2 Lite is out: across the Shadowed Cargo turns it rewrote every failed
 * check as a success, spent five retrieval rounds to transcribe what it read,
 * and emitted HTML entities into prose.
 */
export const PANEL_MODELS = ['amazon-nova-pro'];

/** The pre-retrieval narrator, kept so agentic-versus-not stays measurable. */
export const ONE_SHOT_PANEL_MODELS = ['amazon-nova-pro'];

const runPanelist = async (
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
      chronicleId: context.chronicleId,
      durationMs: Date.now() - startedAt,
      modelId,
      sidecarEntities: outcome.sidecar.length,
      stepCount: outcome.stepCount,
      totalTokens: outcome.usage.totalTokens,
      turnId: context.turnId,
    });
    return {
      costUsd: outcome.costUsd,
      modelId,
      prose: outcome.prose,
      sidecar: outcome.sidecar,
      stepCount: outcome.stepCount,
      totalTokens: outcome.usage.totalTokens,
    };
  } catch (error) {
    log('warn', 'prose-agent.panel.failed', {
      chronicleId: context.chronicleId,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'unknown',
      modelId,
      turnId: context.turnId,
    });
    return null;
  }
};

/**
 * Runs the full panel concurrently. A panelist failure drops that response
 * only; the panel never throws and never fails the turn.
 */
export const runProseAgentPanel = async (
  context: GraphContext,
  agentLoop: AgentLoopClient
): Promise<ProseAlternate[]> => {
  const responses = await Promise.all([
    ...PANEL_MODELS.map(async (modelId) => runPanelist(context, agentLoop, modelId)),
    ...ONE_SHOT_PANEL_MODELS.map(async (modelId) => oneShotPanelist(context, modelId)),
  ]);
  return responses.filter((response) => response !== null);
};

/**
 * The pre-retrieval narrator runs beside the agentic ones so the comparison
 * the panel exists for is still measurable: same turn, same model, no
 * retrieval. Its failure drops its response like any other panelist's.
 */
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
      sidecarEntities: 0,
      stepCount: 1,
      totalTokens: alternate.totalTokens,
      turnId: context.turnId,
    });
    return alternate;
  } catch (error) {
    log('warn', 'prose-agent.panel.failed', {
      chronicleId: context.chronicleId,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'unknown',
      modelId: `${modelId} (one-shot)`,
      turnId: context.turnId,
    });
    return null;
  }
};
