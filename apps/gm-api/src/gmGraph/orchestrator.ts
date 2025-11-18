import {isNonEmptyString, log} from '@glass-frontier/utils';

import type { TurnProgressPublisher, TurnProgressStatus } from '../eventEmitters/progressEmitter';
import type { ChronicleTelemetry } from '../telemetry';
import type { GraphContext } from '../types.js';

export type GraphNodeResult =
  | GraphContext
  | {
  context: GraphContext;
  next?: string | string[] | null;
};

export type GraphNode = {
  readonly id: string;
  execute: (context: GraphContext) => Promise<GraphNodeResult> | GraphNodeResult;
}

export type GraphNodeConfig =
  | GraphNode
  | {
  node: GraphNode;
  next?: string[];
};

type NodeDescriptor = {
  next?: string[];
  node: GraphNode;
  nodeId: string;
  step: number;
  total: number;
};

class GmGraphOrchestrator {
  readonly #descriptors: Map<string, NodeDescriptor> = new Map();
  readonly #telemetry?: ChronicleTelemetry;
  readonly #progressEmitter?: TurnProgressPublisher;
  readonly #entryNodeId: string;

  constructor(
    nodes: GraphNodeConfig[],
    telemetry: ChronicleTelemetry,
    options?: { progressEmitter?: TurnProgressPublisher }
  ) {
    if (nodes.length === 0) {
      throw new Error('LangGraphOrchestrator requires at least one node');
    }
    const descriptors = this.#buildNodeDescriptors(nodes);
    descriptors.forEach((descriptor) => {
      this.#descriptors.set(descriptor.nodeId, descriptor);
    });
    this.#entryNodeId = descriptors[0]?.nodeId ?? '';
    if (!isNonEmptyString(this.#entryNodeId)) {
      throw new Error('LangGraphOrchestrator requires nodes with stable ids.');
    }
    this.#telemetry = telemetry;
    this.#progressEmitter = options?.progressEmitter;
  }

  async run(initialContext: GraphContext, options?: { jobId?: string }): Promise<GraphContext> {
    const jobId = options?.jobId;
    const visited = new Set<string>();
    const executed: string[] = [];
    const queue: string[] = [this.#entryNodeId];
    let context: GraphContext = { ...initialContext };

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!isNonEmptyString(nodeId) || visited.has(nodeId)) {
        continue;
      }
      const descriptor = this.#descriptors.get(nodeId);
      if (descriptor === undefined) {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const execution = await this.#executeNode(descriptor, context, jobId);
      context = execution.context;
      executed.push(nodeId);
      visited.add(nodeId);

      if (context.failure) {
        break;
      }

      const nextTargets = this.#resolveNextTargets(execution.next, descriptor.next);
      queue.unshift(...nextTargets.filter((target) => !visited.has(target)));
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

  async #executeNode(
    descriptor: NodeDescriptor,
    context: GraphContext,
    jobId: string | undefined
  ): Promise<{ context: GraphContext; next?: string[] }> {
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
      const normalized = this.#normalizeResult(execution);
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

  #normalizeResult(result: GraphNodeResult): { context: GraphContext; next?: string[] } {
    if (this.#isGraphContext(result)) {
      return { context: result };
    }
    const structured = result as { context?: GraphContext | null; next?: string | string[] | null };
    if (structured.context === undefined || structured.context === null) {
      throw new Error('Graph node must return a context.');
    }
    return {
      context: structured.context,
      next: this.#normalizeTargets(structured.next),
    };
  }

  #buildNodeDescriptors(initializers: GraphNodeConfig[]): NodeDescriptor[] {
    const nodes = initializers.map((entry) =>
      this.#isGraphNode(entry)
        ? { next: undefined, node: entry }
        : { next: this.#normalizeTargets(entry.next), node: entry.node }
    );
    const normalizedNodes = nodes.map((entry, index, list) => {
      if (entry.next !== undefined && entry.next.length > 0) {
        return entry;
      }
      const nextId = list[index + 1]?.node.id;
      if (isNonEmptyString(nextId)) {
        return { next: [nextId], node: entry.node };
      }
      return entry;
    });
    const total = normalizedNodes.length;
    return normalizedNodes.map((entry, index) => ({
      next: entry.next,
      node: entry.node,
      nodeId: isNonEmptyString(entry.node.id) ? entry.node.id : `node-${index}`,
      step: index + 1,
      total,
    }));
  }

  #normalizeTargets(input?: string | string[] | null): string[] {
    if (typeof input === 'string') {
      return isNonEmptyString(input) ? [input.trim()] : [];
    }
    if (Array.isArray(input)) {
      return input
        .map((candidate) => (isNonEmptyString(candidate) ? candidate.trim() : null))
        .filter((candidate): candidate is string => candidate !== null);
    }
    return [];
  }

  #resolveNextTargets(
    override?: string[],
    fallback?: string[]
  ): string[] {
    const overrideTargets = this.#normalizeTargets(override);
    if (overrideTargets.length > 0) {
      return overrideTargets;
    }
    return this.#normalizeTargets(fallback);
  }
  #isGraphContext(result: GraphNodeResult): result is GraphContext {
    return typeof (result as GraphContext)?.chronicleId === 'string';
  }

  #isGraphNode(entry: GraphNodeConfig): entry is GraphNode {
    return typeof (entry as GraphNode).execute === 'function';
  }
}

export { GmGraphOrchestrator };
