import type { TurnBrief } from '@glass-frontier/dto';
import type { TokenUsage } from '@glass-frontier/llm-client';
import { ZodError } from 'zod';

import type { ToolSession } from './toolSession';

/** How far the scout got, readable from the catch that follows it. */
export type ScoutProgress = {
  stage: 'research' | 'compose' | 'extract';
  stepCount: number;
  usages: TokenUsage[];
};

/**
 * What the scout hands back either way. `briefFailed` is the difference
 * between a discarded brief and a scout that simply did not search, which
 * nothing downstream could tell apart before.
 */
export type ScoutOutcome = {
  brief: TurnBrief;
  briefFailed: boolean;
  costUsd: number;
  session: ToolSession;
  stepCount: number;
  usage: TokenUsage;
};

const UNESTABLISHED = 'not established this turn';

/**
 * A turn with nothing usable retrieved or composed. The writer still has the
 * scene record, the check, and the player's words; a thinner turn beats one
 * the player has to retype.
 */
export const EMPTY_BRIEF: TurnBrief = {
  character: UNESTABLISHED,
  complication: null,
  entities: [],
  history: null,
  location: UNESTABLISHED,
  present: UNESTABLISHED,
  scene: { changed: UNESTABLISHED, endsWhen: UNESTABLISHED, stakes: UNESTABLISHED },
};

/**
 * What actually went wrong, in one line a reader can act on.
 *
 * `error.message` alone logged "Error" and "ZodError" for four consecutive
 * scout failures on A Beautiful Thing Bought as Ringglass — the class name and
 * nothing else — and cost most of a review to trace back to a forced tool call
 * the model had answered in prose. A Zod failure names the fields it rejected;
 * anything else keeps its own message beside its class.
 */
export const describeError = (error: unknown): string => {
  if (error instanceof ZodError) {
    const issues = error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return `${path.length === 0 ? '<root>' : path} ${issue.message}`;
      })
      .join('; ');
    return `ZodError: ${issues}`;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
};
