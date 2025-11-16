import type { Turn } from '@glass-frontier/worldstate';

import type { WorldstateSession } from '../worldstateSession';

export type GraphContext = {
  chronicleId: string;
  turnSequence: number;
  session: WorldstateSession;
  turnDraft: Partial<Turn>;
  effects: Record<string, unknown>;
  failure: boolean;
};

export type GraphNodeResult =
  | GraphContext
  | {
      context: GraphContext;
      next?: string | string[] | null;
    };

export type GraphNode = {
  readonly id: string;
  execute: (context: GraphContext) => Promise<GraphNodeResult> | GraphNodeResult;
};
