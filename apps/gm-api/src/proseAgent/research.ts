import type { TokenUsage } from '@glass-frontier/llm-client';
import { log } from '@glass-frontier/utils';

import type { GraphContext } from '../types';
import { describeError } from './scoutResult';
import { RETRIEVED_TOKEN_BUDGET } from './toolSession';

/** Research iterations (search + evaluate) before composing regardless. */
const MAX_RESEARCH_ITERATIONS = 3;

export type ResearchRound = {
  evaluate: () => Promise<{ usage: TokenUsage; verdict: { gaps: string[]; status: string } }>;
  search: (gaps: string[]) => Promise<{ stepCount: number; usage: TokenUsage }>;
  spentTokens: () => number;
};

/**
 * One search-and-judge round, and whether research is over.
 *
 * A round that throws ends research rather than the turn. Retrieval is
 * best-effort by nature — the material already gathered is what the brief gets
 * written from, and losing a chronicle's briefs because a judge call failed is
 * a trade nobody would make. Kimi's evaluator threw on every turn of The train
 * that runs on Warm Argument's ore and took ten tool calls' worth of retrieved
 * canon down with it.
 */
const runRound = async (
  context: GraphContext,
  round: ResearchRound,
  input: { gaps: string[]; iteration: number }
): Promise<{ done: boolean; gaps: string[]; stepCount: number; usages: TokenUsage[] }> => {
  const usages: TokenUsage[] = [];
  // Whatever the search managed before a later call threw still happened, and
  // the failure path has to report it. Zeroing it is how a scout that searched
  // ten times came to look like one that never searched at all.
  let stepCount = 0;
  try {
    const search = await round.search(input.gaps);
    usages.push(search.usage);
    stepCount = search.stepCount;
    if (input.iteration === MAX_RESEARCH_ITERATIONS
      || round.spentTokens() >= RETRIEVED_TOKEN_BUDGET) {
      return { done: true, gaps: [], stepCount, usages };
    }
    const evaluated = await round.evaluate();
    usages.push(evaluated.usage);
    log('info', 'prose-agent.research.verdict', {
      chronicleId: context.chronicleId,
      gaps: evaluated.verdict.gaps.join(' | ').slice(0, 300),
      iteration: input.iteration,
      status: evaluated.verdict.status,
      turnId: context.turnId,
    });
    const done = evaluated.verdict.status === 'sufficient'
      || evaluated.verdict.gaps.length === 0;
    return { done, gaps: evaluated.verdict.gaps, stepCount, usages };
  } catch (error) {
    log('warn', 'prose-agent.research.round_failed', {
      chronicleId: context.chronicleId,
      detail: describeError(error),
      iteration: input.iteration,
      turnId: context.turnId,
    });
    return { done: true, gaps: [], stepCount, usages };
  }
};

/** Search and judge until the judge is satisfied, the budget runs, or a round fails. */
export const runResearch = async (
  context: GraphContext,
  round: ResearchRound
): Promise<{ stepCount: number; usages: TokenUsage[] }> => {
  const usages: TokenUsage[] = [];
  let stepCount = 0;
  let gaps: string[] = [];
  for (let iteration = 1; iteration <= MAX_RESEARCH_ITERATIONS; iteration += 1) {
    // eslint-disable-next-line no-await-in-loop -- each round builds on the last
    const outcome = await runRound(context, round, { gaps, iteration });
    stepCount += outcome.stepCount;
    usages.push(...outcome.usages);
    if (outcome.done) {
      break;
    }
    gaps = outcome.gaps;
  }
  return { stepCount, usages };
};
