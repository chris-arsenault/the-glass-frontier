import { log } from '@glass-frontier/utils';

import type { TurnProgressPublisher, TurnProgressStatus } from '../eventEmitters/progressEmitter';
import type { ChronicleTelemetry } from '../telemetry';
import type { GraphContext } from '../types.js';
import type { GraphNode, GraphNodeDelta } from './nodes/graphNode';

// Pipeline stage: either a single node or a parallel group
export type PipelineStage =
  | { type: 'sequential'; nodeId: string }
  | { type: 'parallel'; nodeIds: string[] };

type NodeDescriptor = {
  node: GraphNode;
  nodeId: string;
  step: number;
  total: number;
};

type RunState = { context: GraphContext; executed: string[] };

class GmGraphOrchestrator {
  readonly #descriptors: Map<string, NodeDescriptor> = new Map();
  readonly #pipeline: PipelineStage[];
  readonly #telemetry?: ChronicleTelemetry;
  readonly #progressEmitter?: TurnProgressPublisher;

  constructor(
    nodes: GraphNode[],
    pipeline: PipelineStage[],
    telemetry: ChronicleTelemetry,
    options?: { progressEmitter?: TurnProgressPublisher }
  ) {
    const descriptors = this.#buildNodeDescriptors(nodes);
    descriptors.forEach((descriptor) => {
      this.#descriptors.set(descriptor.nodeId, descriptor);
    });
    this.#pipeline = pipeline;
    this.#telemetry = telemetry;
    this.#progressEmitter = options?.progressEmitter;
  }

  async run(initialContext: GraphContext, options?: { jobId?: string }): Promise<GraphContext> {
    const jobId = options?.jobId;
    const state = await this.#runPipeline(
      0,
      { context: initialContext, executed: [] },
      jobId
    );
    if (state.executed.length === 0) {
      return state.context;
    }
    return {
      ...state.context,
      executedNodes: [...(state.context.executedNodes ?? []), ...state.executed],
    };
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
    if (jobId === undefined || this.#progressEmitter === undefined) {
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

  async #executeNode(
    descriptor: NodeDescriptor,
    context: GraphContext,
    jobId: string | undefined
  ): Promise<GraphNodeDelta> {
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
      const delta = await node.execute(context);
      const applied = { ...context, ...delta };
      const status: TurnProgressStatus = applied.failure ? 'error' : 'success';
      await this.#notifyStatus({
        context: applied,
        jobId,
        nodeId,
        status,
        step,
        total,
      });
      return delta;
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

  #buildNodeDescriptors(nodes: GraphNode[]): NodeDescriptor[] {
    const total = nodes.length;
    return nodes.map((node, index) => ({
      node,
      nodeId: node.id,
      step: index + 1,
      total,
    }));
  }

  async #runPipeline(
    stageIndex: number,
    state: RunState,
    jobId: string | undefined
  ): Promise<RunState> {
    const stage = this.#pipeline.at(stageIndex);
    if (stage === undefined || state.context.failure) {
      return state;
    }
    const next = await this.#executeStage(stage, state, jobId);
    return this.#runPipeline(stageIndex + 1, next, jobId);
  }

  async #executeStage(
    stage: PipelineStage,
    state: RunState,
    jobId: string | undefined
  ): Promise<RunState> {
    if (state.context.failure) {
      return state;
    }
    if (stage.type === 'parallel') {
      const result = await this.#runParallelGroup(stage.nodeIds, state.context, jobId);
      return {
        context: result.context,
        executed: [...state.executed, ...result.executedNodes],
      };
    }
    const descriptor = this.#descriptors.get(stage.nodeId);
    if (descriptor === undefined) {
      throw new Error(`Unknown node: ${stage.nodeId}`);
    }
    const delta = await this.#executeNode(descriptor, state.context, jobId);
    const context = { ...state.context, ...delta };
    const label = descriptor.nodeId === 'gm-response-node'
      ? `${descriptor.nodeId} (${context.playerIntent?.intentType ?? 'unclassified'})`
      : descriptor.nodeId;
    return { context, executed: [...state.executed, label] };
  }

  async #runParallelGroup(
    nodeIds: string[],
    context: GraphContext,
    jobId?: string
  ): Promise<{ context: GraphContext; executedNodes: string[] }> {
    const deltas = await Promise.all(
      nodeIds.map((nodeId) => {
        const descriptor = this.#descriptors.get(nodeId);
        if (descriptor === undefined) {
          throw new Error(`Unknown graph node ${nodeId}`);
        }
        return this.#executeNode(descriptor, context, jobId);
      })
    );
    let merged = context;
    for (const delta of deltas) {
      merged = { ...merged, ...delta };
    }
    return {
      context: merged,
      executedNodes: [...nodeIds],
    };
  }
}

export { GmGraphOrchestrator };
