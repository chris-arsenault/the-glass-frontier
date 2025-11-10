import type { GraphContext } from "../types.js";
import type { SessionTelemetry } from "../telemetry";

export interface GraphNode {
  readonly id: string;
  execute(context: GraphContext): Promise<GraphContext> | GraphContext;
}

class LangGraphOrchestrator {
  readonly #nodes: GraphNode[];
  readonly #telemetry?: SessionTelemetry;

  constructor(nodes: GraphNode[], telemetry: SessionTelemetry) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error("LangGraphOrchestrator requires at least one node");
    }
    this.#nodes = nodes;
    this.#telemetry = telemetry;
  }

  async run(initialContext: GraphContext): Promise<GraphContext> {
    let context = { ...initialContext };

    for (const node of this.#nodes) {
      const nodeId = node.id || "unknown-node";

      this.#telemetry?.recordTransition({
        sessionId: context.sessionId,
        nodeId,
        status: "start",
        turnSequence: context.turnSequence
      });

      try {
        // eslint-disable-next-line no-await-in-loop
        context = await node.execute(context);
        if (context.failure) {
          this.#telemetry?.recordTransition({
            sessionId: context.sessionId,
            nodeId,
            status: "error",
            turnSequence: context.turnSequence,
          });
          return context;
        }

        this.#telemetry?.recordTransition({
          sessionId: context.sessionId,
          nodeId,
          status: "success",
          turnSequence: context.turnSequence
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        this.#telemetry?.recordTransition({
          sessionId: context.sessionId,
          nodeId,
          status: "error",
          turnSequence: context.turnSequence,
          metadata: { message }
        });
        throw error;
      }
    }

    return context;
  }
}

export { LangGraphOrchestrator };
