import { describe, expect, it } from 'vitest';

import type { GraphNode } from '../src/gmGraph/nodes/graphNode';
import { GmGraphOrchestrator, type PipelineStage } from '../src/gmGraph/orchestrator';
import type { GraphContext } from '../src/types';
import { buildContext, buildIntent, telemetry } from './harness';

const node = (id: string, execute: GraphNode['execute']): GraphNode => ({ execute, id });

const runGraph = async (
  nodes: GraphNode[],
  pipeline: PipelineStage[],
  context: GraphContext
): Promise<GraphContext> => {
  const orchestrator = new GmGraphOrchestrator(nodes, pipeline, telemetry);
  return orchestrator.run(context);
};

describe('GmGraphOrchestrator', () => {
  it('keeps every sibling delta from a parallel group', async () => {
    const context = buildContext({ playerIntent: buildIntent() });
    const detector = node('detector', (current) => ({
      playerIntent: {
        ...current.playerIntent!,
        thread: { action: 'focus', title: 'Relay heist' },
      },
    }));
    const planner = node('planner', () => ({
      skillCheckPlan: { skill: 'Salvage' } as GraphContext['skillCheckPlan'],
    }));
    const closer = node('closer', () => ({
      gmSummary: 'Vex opens the relay core.',
      worldContent: 'The factor seals the inner relay.',
    }));
    const focus = node('focus', (current) => ({
      chronicleState: {
        ...current.chronicleState,
        chronicle: {
          ...current.chronicleState.chronicle,
          entityFocus: { entityScores: { 'entity-1': 1 }, tagScores: {} },
        },
      },
    }));
    const skipped = node('skipped', () => ({}));

    const result = await runGraph(
      [detector, planner, closer, focus, skipped],
      [{ nodeIds: ['detector', 'planner', 'closer', 'focus', 'skipped'], type: 'parallel' }],
      context
    );

    expect(result.playerIntent?.thread).toEqual({ action: 'focus', title: 'Relay heist' });
    expect(result.skillCheckPlan?.skill).toBe('Salvage');
    expect(result.gmSummary).toBe('Vex opens the relay core.');
    expect(result.worldContent).toBe('The factor seals the inner relay.');
    expect(result.chronicleState.chronicle.entityFocus).toEqual({
      entityScores: { 'entity-1': 1 },
      tagScores: {},
    });
    expect(result.executedNodes).toEqual(['detector', 'planner', 'closer', 'focus', 'skipped']);
  });

  it('propagates a failure from one parallel sibling past quieter siblings', async () => {
    const failing = node('failing', () => ({ failure: true }));
    const quiet = node('quiet', () => ({}));
    let ranAfter = false;
    const after = node('after', () => {
      ranAfter = true;
      return {};
    });

    const result = await runGraph(
      [failing, quiet, after],
      [
        { nodeIds: ['failing', 'quiet'], type: 'parallel' },
        { nodeId: 'after', type: 'sequential' },
      ],
      buildContext()
    );

    expect(result.failure).toBe(true);
    expect(ranAfter).toBe(false);
    expect(result.executedNodes).toEqual(['failing', 'quiet']);
  });

  it('accumulates sequential deltas and labels the gm response node with the intent', async () => {
    const classifier = node('classifier', () => ({
      playerIntent: buildIntent({ intentType: 'inquiry' }),
    }));
    const responder = node('gm-response-node', (current) => ({
      gmResponse: {
        content: `You study the panel, ${current.chronicleState.character.name}.`,
        id: 'gm-1',
        metadata: { tags: [], timestamp: 0 },
        role: 'gm',
      },
    }));

    const result = await runGraph(
      [classifier, responder],
      [
        { nodeId: 'classifier', type: 'sequential' },
        { nodeId: 'gm-response-node', type: 'sequential' },
      ],
      buildContext()
    );

    expect(result.playerIntent?.intentType).toBe('inquiry');
    expect(result.gmResponse?.content).toContain('Vex');
    expect(result.executedNodes).toEqual(['classifier', 'gm-response-node (inquiry)']);
  });

  it('halts the pipeline when a sequential node fails', async () => {
    const failing = node('failing', () => ({ failure: true }));
    let ranAfter = false;
    const after = node('after', () => {
      ranAfter = true;
      return {};
    });

    const result = await runGraph(
      [failing, after],
      [
        { nodeId: 'failing', type: 'sequential' },
        { nodeId: 'after', type: 'sequential' },
      ],
      buildContext()
    );

    expect(result.failure).toBe(true);
    expect(ranAfter).toBe(false);
  });

  it('rethrows when a node throws', async () => {
    const throwing = node('throwing', () => {
      throw new Error('node exploded');
    });

    await expect(
      runGraph([throwing], [{ nodeId: 'throwing', type: 'sequential' }], buildContext())
    ).rejects.toThrow('node exploded');
  });

  it('throws for a pipeline stage naming an unknown node', async () => {
    await expect(
      runGraph([], [{ nodeId: 'missing', type: 'sequential' }], buildContext())
    ).rejects.toThrow('Unknown node: missing');
  });
});
