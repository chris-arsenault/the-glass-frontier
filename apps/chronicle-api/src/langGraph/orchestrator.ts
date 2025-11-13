import { log } from '@glass-frontier/utils';

import type { TurnProgressPublisher, TurnProgressStatus } from '../progressEmitter';
import type { ChronicleTelemetry } from '../telemetry';
import type { GraphContext } from '../types.js';

export type GraphNode = {
  readonly id: string;
  execute: (context: GraphContext) => Promise<GraphContext> | GraphContext;
}

type NodeDescriptor = {
  node: GraphNode;
  nodeId: string;
  step: number;
  total: number;
};

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
    const descriptors = this.#buildNodeDescriptors();
    const jobId = options?.jobId;
    return this.#runNodesSequentially(descriptors, { ...initialContext }, jobId, 0);
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
    if (!isNonEmptyString(jobId) || this.#progressEmitter === undefined) {
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

  async #runNodesSequentially(
    descriptors: NodeDescriptor[],
    context: GraphContext,
    jobId: string | undefined,
    index: number
  ): Promise<GraphContext> {
    if (index >= descriptors.length) {
      return context;
    }

    const descriptor = descriptors.at(index);
    if (descriptor === undefined) {
      return context;
    }

    const nextContext = await this.#executeNode(descriptor, context, jobId);
    if (nextContext.failure) {
      return nextContext;
    }

    return this.#runNodesSequentially(descriptors, nextContext, jobId, index + 1);
  }

  async #executeNode(
    descriptor: NodeDescriptor,
    context: GraphContext,
    jobId: string | undefined
  ): Promise<GraphContext> {
    const { node, nodeId, step, total } = descriptor;
    await this.#notifyStatus({
      context,
      jobId,
      nodeId,
      status: 'start',
      step,
      total,
    });

    try {
      const nextContext = await node.execute(context);
      const status: TurnProgressStatus = nextContext.failure ? 'error' : 'success';
      await this.#notifyStatus({
        context: nextContext,
        jobId,
        nodeId,
        status,
        step,
        total,
      });
      return nextContext;
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

  #buildNodeDescriptors(): NodeDescriptor[] {
    const total = this.#nodes.length;
    return this.#nodes.map((node, index) => ({
      node,
      nodeId: isNonEmptyString(node.id) ? node.id : `node-${index}`,
      step: index + 1,
      total,
    }));
  }
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export { LangGraphOrchestrator };
