import type { ProseAlternate } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';

import type { GraphContext } from '../types';
import { runOneShotProse } from './oneShot';

/**
 * The comparison panel: one response, written without retrieval, on the same
 * model that wrote the canonical turn.
 *
 * The panel used to run a second full scout — search, evaluate, compose,
 * extract — on Nova Pro. It answered nothing. Its evaluator never returned
 * `sufficient`, so it burned the three-round cap on every turn, and it named
 * gaps as bare nouns (`["foreman","radiator crisis","hidden cargo"]`, returned
 * byte-identical on two consecutive rounds of Radiators Raised in Daylight
 * turn 3) that the searcher could not act on and the evaluator did not notice
 * repeating. Forty percent of the chronicle's input tokens went to a loop that
 * could not converge, and what it produced was a second model's prose rather
 * than an answer about retrieval.
 *
 * What is left is the question worth asking: does retrieval earn its cost?
 * Holding the model fixed and varying only the context is the comparison that
 * answers it — a different model in the other chair only ever measured the
 * model.
 */
const oneShotPanelist = async (context: GraphContext): Promise<ProseAlternate | null> => {
  const startedAt = Date.now();
  try {
    const alternate = await runOneShotProse(context);
    log('info', 'prose-agent.panel.completed', {
      chronicleId: context.chronicleId,
      durationMs: Date.now() - startedAt,
      modelId: alternate.modelId,
      totalTokens: alternate.totalTokens,
      turnId: context.turnId,
    });
    return alternate;
  } catch (error) {
    log('warn', 'prose-agent.panel.failed', {
      chronicleId: context.chronicleId,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'unknown',
      turnId: context.turnId,
    });
    return null;
  }
};

/** A panelist failure drops that response only; the panel never fails a turn. */
export const runProseAgentPanel = async (
  context: GraphContext
): Promise<ProseAlternate[]> => {
  const response = await oneShotPanelist(context);
  return response === null ? [] : [response];
};
