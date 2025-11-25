import { log } from '@glass-frontier/utils';

import type { TurnProgressPublisher, TurnProgressStatus } from '../eventEmitters/progressEmitter';
import type { ChronicleTelemetry } from '../telemetry';
import type { GraphContext } from '../types.js';

export type GraphNodeResult =
  | GraphContext
  | {
      context: GraphContext;
      next?: string[];
    };

export type GraphNode = {
  readonly id: string;
  execute: (context: GraphContext) => Promise<GraphNodeResult> | GraphNodeResult;
}

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
    let context: GraphContext = initialContext;
    const executed: string[] = [];

    for (const stage of this.#pipeline) {
      if (context.failure) {
        break;
      }

      if (stage.type === 'sequential') {
        const descriptor = this.#descriptors.get(stage.nodeId);
        if (!descriptor) {
          throw new Error(`Unknown node: ${stage.nodeId}`);
        }
        const result = await this.#executeNode(descriptor, context, jobId);
        let ranNode = descriptor.nodeId;
        if (ranNode === 'gm-response-node') {
          ranNode += ` (${result.context.playerIntent?.intentType})`;
        }
        executed.push(ranNode);
        context = result.context;
      } else {
        // parallel stage
        const parallelResult = await this.#runParallelGroup(stage.nodeIds, context, jobId);
        executed.push(...parallelResult.executedNodes);
        context = parallelResult.context;
      }
    }

    if (executed.length > 0) {
      context = {
        ...context,
        executedNodes: [...(context.executedNodes ?? []), ...executed],
      };
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
    if (!jobId || this.#progressEmitter === undefined) {
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
  ): Promise<GraphNodeResult> {
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
      const execution = await node.execute(context);
      const normalized = this.#unwrapResult(execution);
      const status: TurnProgressStatus = normalized.context.failure ? 'error' : 'success';
      await this.#notifyStatus({
        context: normalized.context,
        jobId,
        nodeId,
        status,
        step,
        total,
      });
      return normalized;
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

  #unwrapResult(result: GraphNodeResult): { context: GraphContext } {
    if (typeof (result as { context?: GraphContext }).context === 'object') {
      return result as { context: GraphContext };
    }
    return { context: result as GraphContext };
  }

  async #runParallelGroup(
    nodeIds: string[],
    context: GraphContext,
    jobId?: string
  ): Promise<{ context: GraphContext; executedNodes: string[] }> {
    const executions = await Promise.all(
      nodeIds.map(async (nodeId) => {
        const descriptor = this.#descriptors.get(nodeId);
        if (!descriptor) {
          throw new Error(`Unknown graph node ${nodeId}`);
        }
        const result = await this.#executeNode(descriptor, context, jobId);
        return { descriptor, result };
      })
    );
    const ordered = nodeIds.map((nodeId) => {
      const entry = executions.find((candidate) => candidate.descriptor.nodeId === nodeId);
      if (!entry) {
        throw new Error(`Missing execution result for ${nodeId}`);
      }
      return entry;
    });
    let mergedContext = context;
    ordered.forEach((entry) => {
      mergedContext = this.#mergeContexts(mergedContext, entry.result.context);
    });
    return {
      context: mergedContext,
      executedNodes: ordered.map((entry) => entry.descriptor.nodeId),
    };
  }

  #mergeContexts(base: GraphContext, update: GraphContext): GraphContext {
    return {
      ...base,
      ...update,
      beatTracker: update.beatTracker ?? base.beatTracker,
      chronicleState: update.chronicleState ?? base.chronicleState,
      gmResponse: update.gmResponse ?? base.gmResponse,
      gmSummary: update.gmSummary ?? base.gmSummary,
      handlerId: update.handlerId ?? base.handlerId,
      inventoryDelta: update.inventoryDelta ?? base.inventoryDelta,
      locationDelta: update.locationDelta ?? base.locationDelta,
      entityContext: update.entityContext ?? base.entityContext,
      entityUsage: update.entityUsage ?? base.entityUsage,
      playerIntent: update.playerIntent ?? base.playerIntent,
      skillCheckPlan: update.skillCheckPlan ?? base.skillCheckPlan,
      skillCheckResult: update.skillCheckResult ?? base.skillCheckResult,
      systemMessage: update.systemMessage ?? base.systemMessage,
      worldDeltaTags: update.worldDeltaTags ?? base.worldDeltaTags,
    };
  }
}

export { GmGraphOrchestrator };
