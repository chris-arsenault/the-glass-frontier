import { log } from '@glass-frontier/utils';

import type { TurnProgressPublisher, TurnProgressStatus } from '../progressEmitter';
import type { ChronicleTelemetry } from '../telemetry';
import type { GraphContext } from '../types.js';

export type GraphNode = {
  readonly id: string;
  execute: (context: GraphContext) => Promise<GraphContext> | GraphContext;
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

      await this.#notifyStatus({
        context,
        jobId,
        nodeId,
        status: 'start',
        step,
        total,
      });

      try {
        context = await node.execute(context);
        if (context.failure) {
          await this.#notifyStatus({
            context,
            jobId,
            nodeId,
            status: 'error',
            step,
            total,
          });
          return context;
        }

        await this.#notifyStatus({
          context,
          jobId,
          nodeId,
          status: 'success',
          step,
          total,
        });
      } catch (error) {
        await this.#notifyStatus({
          context,
          jobId,
          metadata: { message: error instanceof Error ? error.message : 'unknown' },
          nodeId,
          status: 'error',
          step,
          total,
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

  async #notifyStatus({
    context,
    jobId,
    metadata,
    nodeId,
    status,
    step,
    total,
  }: {
    context: GraphContext;
    jobId?: string;
    metadata?: Record<string, unknown>;
    nodeId: string;
    status: TurnProgressStatus;
    step: number;
    total: number;
  }): Promise<void> {
    this.#telemetry?.recordTransition({
      chronicleId: context.chronicleId,
      metadata,
      nodeId,
      status,
      turnSequence: context.turnSequence,
    });
    await this.emitProgress(jobId, {
      chronicleId: context.chronicleId,
      context,
      nodeId,
      status,
      step,
      total,
      turnSequence: context.turnSequence,
    });
  }
}

export { LangGraphOrchestrator };
