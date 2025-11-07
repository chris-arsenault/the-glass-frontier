"use strict";

/**
 * Lightweight LangGraph-inspired orchestrator that executes narrative nodes in sequence,
 * capturing telemetry at each transition. Nodes are simple objects with an `id` string
 * and an async `execute(context)` method that returns the updated context.
 */
class LangGraphOrchestrator {
  constructor({ nodes, telemetry }) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error("LangGraphOrchestrator requires at least one node");
    }

    this.nodes = nodes;
    this.telemetry = telemetry;
  }

  async run(initialContext) {
    let context = { ...initialContext };

    for (const node of this.nodes) {
      const nodeId = node.id || "unknown-node";

      this.telemetry?.recordTransition({
        sessionId: context.sessionId,
        nodeId,
        status: "start",
        turnSequence: context.turnSequence
      });

      try {
        // eslint-disable-next-line no-await-in-loop
        context = await node.execute(context);

        this.telemetry?.recordTransition({
          sessionId: context.sessionId,
          nodeId,
          status: "success",
          turnSequence: context.turnSequence
        });
      } catch (error) {
        this.telemetry?.recordTransition({
          sessionId: context.sessionId,
          nodeId,
          status: "error",
          turnSequence: context.turnSequence,
          metadata: {
            message: error.message
          }
        });
        throw error;
      }
    }

    return context;
  }
}

export {
  LangGraphOrchestrator
};
