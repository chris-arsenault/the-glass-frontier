import type { GraphContext } from "../types.js";
import type { ChronicleTelemetry } from "../telemetry";

export interface GraphNode {
  readonly id: string;
  execute(context: GraphContext): Promise<GraphContext> | GraphContext;
}

class LangGraphOrchestrator {
  readonly #nodes: GraphNode[];
  readonly #telemetry?: ChronicleTelemetry;

  constructor(nodes: GraphNode[], telemetry: ChronicleTelemetry) {
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
        chronicleId: context.chronicleId,
        nodeId,
        status: "start",
        turnSequence: context.turnSequence
      });

      try {
        // eslint-disable-next-line no-await-in-loop
        context = await node.execute(context);
        if (context.failure) {
          this.#telemetry?.recordTransition({
            chronicleId: context.chronicleId,
            nodeId,
            status: "error",
            turnSequence: context.turnSequence,
          });
          return context;
        }

        this.#telemetry?.recordTransition({
          chronicleId: context.chronicleId,
          nodeId,
          status: "success",
          turnSequence: context.turnSequence
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        this.#telemetry?.recordTransition({
          chronicleId: context.chronicleId,
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
