import type { GraphContext } from '../types.js';
import type { ChronicleTelemetry } from '../telemetry';
import type { TurnProgressPublisher, TurnProgressStatus } from '../progressEmitter';
import { log } from '@glass-frontier/utils';

export interface GraphNode {
  readonly id: string;
  execute(context: GraphContext): Promise<GraphContext> | GraphContext;
}

class LangGraphOrchestrator {
  readonly #nodes: GraphNode[];
  readonly #telemetry?: ChronicleTelemetry;
  readonly #progressEmitter?: TurnProgressPublisher;

  constructor(
    nodes: GraphNode[],
    telemetry: ChronicleTelemetry,
    options?: { progressEmitter?: TurnProgressPublisher }
  ) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error('LangGraphOrchestrator requires at least one node');
    }
    this.#nodes = nodes;
    this.#telemetry = telemetry;
    this.#progressEmitter = options?.progressEmitter;
  }

  async run(initialContext: GraphContext, options?: { jobId?: string }): Promise<GraphContext> {
    let context = { ...initialContext };
    const jobId = options?.jobId;
    const total = this.#nodes.length;

    for (let index = 0; index < this.#nodes.length; index += 1) {
      const node = this.#nodes[index];
      const nodeId = node.id || 'unknown-node';
      const step = index + 1;

      this.#telemetry?.recordTransition({
        chronicleId: context.chronicleId,
        nodeId,
        status: 'start',
        turnSequence: context.turnSequence,
      });
      await this.emitProgress(jobId, {
        chronicleId: context.chronicleId,
        turnSequence: context.turnSequence,
        nodeId,
        status: 'start',
        step,
        total,
        context,
      });

      try {
        context = await node.execute(context);
        if (context.failure) {
          this.#telemetry?.recordTransition({
            chronicleId: context.chronicleId,
            nodeId,
            status: 'error',
            turnSequence: context.turnSequence,
          });
          await this.emitProgress(jobId, {
            chronicleId: context.chronicleId,
            nodeId,
            status: 'error',
            turnSequence: context.turnSequence,
            step,
            total,
            context,
          });
          return context;
        }

        this.#telemetry?.recordTransition({
          chronicleId: context.chronicleId,
          nodeId,
          status: 'success',
          turnSequence: context.turnSequence,
        });
        await this.emitProgress(jobId, {
          chronicleId: context.chronicleId,
          nodeId,
          status: 'success',
          turnSequence: context.turnSequence,
          step,
          total,
          context,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.#telemetry?.recordTransition({
          chronicleId: context.chronicleId,
          nodeId,
          status: 'error',
          turnSequence: context.turnSequence,
          metadata: { message },
        });
        await this.emitProgress(jobId, {
          chronicleId: context.chronicleId,
          nodeId,
          status: 'error',
          turnSequence: context.turnSequence,
          step,
          total,
          context,
        });
        throw error;
      }
    }

    return context;
  }

  private async emitProgress(
    jobId: string | undefined,
    update: {
      chronicleId: string;
      turnSequence: number;
      nodeId: string;
      status: TurnProgressStatus;
      step: number;
      total: number;
      context: GraphContext;
    }
  ): Promise<void> {
    if (!jobId || !this.#progressEmitter) {
      return;
    }
    try {
      await this.#progressEmitter.publish({
        ...update,
        jobId,
      });
    } catch (error) {
      log('warn', 'Failed to publish turn progress', {
        jobId,
        nodeId: update.nodeId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}

export { LangGraphOrchestrator };
