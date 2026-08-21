import type { GraphContext } from '../../types';

export type GraphTelemetry = {
  recordToolError?: (entry: {
    chronicleId: string;
    operation: string;
    message: string;
    attempt: number;
  }) => void;
  recordToolNotRun?: (entry: { chronicleId: string; operation: string }) => void;
};

/**
 * Nodes return only the fields they changed. The orchestrator spreads the
 * delta onto the running context, so a parallel sibling that carries an
 * unchanged copy of a field can never clobber another sibling's write.
 */
export type GraphNodeDelta = Partial<GraphContext>;

export type GraphNode = {
  readonly id: string;
  execute: (context: GraphContext) => Promise<GraphNodeDelta> | GraphNodeDelta;
};
