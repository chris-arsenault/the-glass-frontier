import type { ActiveScene, NarrativeThread, Turn } from '@glass-frontier/dto';
import { describe, expect, it, vi } from 'vitest';

import { IntentClassifierNode } from '../src/gmGraph/nodes/classifiers/IntentClassifierNode';
import { LocalContinuityNode } from '../src/gmGraph/nodes/LocalContinuityNode';
import { NarrativeBoundaryNode } from '../src/gmGraph/nodes/NarrativeBoundaryNode';
import { ThreadPositionNode } from '../src/gmGraph/nodes/ThreadPositionNode';
import { projectScene } from '../src/scenes/boundedScene';
import type { GraphContext } from '../src/types';
import { ChronicleUpdater } from '../src/updaters/ChronicleUpdater';
import { buildContext, buildIntent } from './harness';

const OLD_QUESTION = 'Can Vex open the gallery?';
const OLD_FACT = 'The brass key also opens the relay.';
const NEW_FACT = 'The gallery opens and Vex enters the relay.';
const BLOCKED_POSITION = 'Access is blocked.';
const SCENE: ActiveScene = {
  id: 'opening-turn', question: OLD_QUESTION, threadId: 'goal-a', turnsRemaining: 2, type: 'search',
};
const thread = (id: string): NarrativeThread => ({
  goal: `Pursue ${id}`, id, owner: 'Vex', perspective: 'player',
  position: BLOCKED_POSITION, title: id, updatedAtTurn: 0,
});
const narration = (content: string): NonNullable<Turn['gmResponse']> => ({
  content, id: 'gm', metadata: { tags: [], timestamp: 0 }, role: 'gm',
});
const priorTurn = (): Turn => ({
  chronicleId: 'chronicle-1', failure: false, gmResponse: narration(OLD_FACT),
  gmSummary: 'A key was found.', id: 'copied-turn-id',
  playerMessage: { ...narration('I examine the key.'), role: 'player' }, turnSequence: 1,
});

const setup = (): {
  context: GraphContext;
  generate: ReturnType<typeof vi.fn>;
  structured: ReturnType<typeof vi.fn>;
} => {
  const generate = vi.fn().mockResolvedValue({ message: NEW_FACT });
  const structured = vi.fn().mockResolvedValue({ data: { sceneAnswered: true, timePassed: false } });
  const context = buildContext({
    effectiveFocusedThreadId: 'goal-a', effectiveScene: SCENE,
    effectiveThreads: [thread('goal-a'), thread('goal-b')], gmResponse: narration(NEW_FACT),
    playerIntent: buildIntent(), turnSequence: 2,
  });
  context.chronicleState.chronicle.activeScene = SCENE;
  context.chronicleState.chronicle.threads = context.effectiveThreads;
  context.chronicleState.chronicle.focusedThreadId = 'goal-a';
  context.chronicleState.turns = [priorTurn()];
  context.chronicleStore.listSceneTurns = vi.fn().mockResolvedValue([priorTurn()]);
  context.llm = { generate, generateStructured: structured } as unknown as GraphContext['llm'];
  context.modelConfigStore = {
    getModelForCategory: () => Promise.resolve('amazon-nova-lite'),
  } as unknown as GraphContext['modelConfigStore'];
  context.templates = { render: () => Promise.resolve('instructions') } as unknown as GraphContext['templates'];
  return { context, generate, structured };
};

describe('scene boundaries and their evidence', () => {
  it.each(['leave', 'open'] as const)('keeps the outgoing goal when classification switches focus and chooses %s', async (action) => {
    const { context, generate, structured } = setup();
    structured.mockResolvedValue({ data: {
      creativeSpark: false, intentSummary: 'Return to goal B.', intentType: 'action',
      scene: action === 'open' ? { action, question: 'Will the crew help?', type: 'dialog' } : { action },
      thread: { action: 'focus', title: 'goal-b' },
    } });
    const projected = { ...context, ...await new IntentClassifierNode().execute(context) };
    expect(projected.effectiveFocusedThreadId).toBe('goal-b');
    expect(projected.completedScenes).toEqual([SCENE]);
    const updates = await new ThreadPositionNode().execute(projected);
    expect(updates.threadPositionUpdates).toEqual([{ position: NEW_FACT, threadId: 'goal-a' }]);
    const input = JSON.stringify(generate.mock.calls);
    expect(input).toContain(OLD_QUESTION);
    expect(input).toContain(OLD_FACT);
    expect(input).not.toContain('Will the crew help?');
    const result = new ChronicleUpdater().update({ ...projected, ...updates });
    expect(result.chronicleState.chronicle.threads[0]?.position).toBe(NEW_FACT);
    expect(result.chronicleState.chronicle.threads[1]?.position).toBe(BLOCKED_POSITION);
  });

  it('updates the linked goal when the budget expires after a focus switch', async () => {
    const { context } = setup();
    const projection = projectScene({
      activeScene: { ...SCENE, turnsRemaining: 1 }, directive: { action: 'continue' },
      focusedThreadId: 'goal-b', intentType: 'action', turnId: context.turnId,
    });
    const updates = await new ThreadPositionNode().execute({
      ...context, completedScenes: projection.completedScenes,
      effectiveFocusedThreadId: 'goal-b', effectiveScene: projection.effectiveScene,
      sceneBoundary: projection.boundary, sceneWillClose: projection.willClose,
    });
    expect(updates.threadPositionUpdates?.[0]?.threadId).toBe('goal-a');
  });

  it('closes an answered scene early, records prior progress, and persists the boundary', async () => {
    const { context, generate, structured } = setup();
    const boundary = await new NarrativeBoundaryNode().execute(context);
    expect(boundary).toMatchObject({ completedScenes: [SCENE], sceneBoundary: true, sceneWillClose: true });
    expect(JSON.stringify(structured.mock.calls)).toContain(OLD_FACT);
    expect(JSON.stringify(structured.mock.calls)).toContain(NEW_FACT);
    const completed = { ...context, ...boundary };
    const positions = await new ThreadPositionNode().execute(completed);
    const continuity = await new LocalContinuityNode().execute(completed);
    const updated = new ChronicleUpdater().update({ ...completed, ...positions, ...continuity });
    expect(updated.chronicleState.chronicle.activeScene).toBeNull();
    expect(updated.chronicleState.chronicle.threads[0]?.position).toBe(NEW_FACT);
    expect(updated.chronicleState.chronicle.localContinuity?.note).toBe(NEW_FACT);
    for (const call of generate.mock.calls) {
      expect(JSON.stringify(call)).toContain(OLD_FACT);
      expect(JSON.stringify(call)).toContain(NEW_FACT);
    }
  });

  it('keeps an unanswered scene and recognizes elapsed time for an action', async () => {
    const { context, structured } = setup();
    structured.mockResolvedValue({ data: { sceneAnswered: false, timePassed: true } });
    context.effectiveScene = null;
    context.gmResponse = narration('You wait until dawn.');
    expect(await new NarrativeBoundaryNode().execute(context)).toEqual({ timePassed: true });
  });

  it('records both goals when a replacement scene also finishes on the current turn', async () => {
    const { context } = setup();
    const replacement = { ...SCENE, id: context.turnId, threadId: 'goal-b' };
    context.completedScenes = [SCENE];
    context.effectiveScene = replacement;
    const boundary = await new NarrativeBoundaryNode().execute(context);
    expect(boundary.completedScenes).toEqual([SCENE, replacement]);
    const updates = await new ThreadPositionNode().execute({ ...context, ...boundary });
    expect(updates.threadPositionUpdates).toEqual([
      { position: NEW_FACT, threadId: 'goal-a' },
      { position: NEW_FACT, threadId: 'goal-b' },
    ]);
  });

  it('includes the opening turn before any local note exists', async () => {
    const { context, generate } = setup();
    context.chronicleState.chronicle.localContinuity = null;
    context.chronicleState.turns = [{ ...priorTurn(), turnSequence: 0 }];
    context.sceneBoundary = true;
    await new LocalContinuityNode().execute(context);
    expect(JSON.stringify(generate.mock.calls)).toContain(OLD_FACT);
  });

  it('keeps deterministic expiry when auxiliary reads fail', async () => {
    const { context, generate, structured } = setup();
    structured.mockRejectedValue(new Error('classifier unavailable'));
    expect(await new NarrativeBoundaryNode().execute(context)).toEqual({});
    generate.mockRejectedValue(new Error('summary unavailable'));
    context.completedScenes = [SCENE];
    context.sceneBoundary = true;
    context.sceneWillClose = true;
    const positions = await new ThreadPositionNode().execute(context);
    const continuity = await new LocalContinuityNode().execute(context);
    const updated = new ChronicleUpdater().update({ ...context, ...positions, ...continuity });
    expect(updated.failure).toBe(false);
    expect(updated.gmResponse?.content).toBe(NEW_FACT);
    expect(updated.chronicleState.chronicle.activeScene).toBeNull();
    expect(updated.chronicleState.chronicle.threads[0]?.position).toBe(BLOCKED_POSITION);
  });

  it('does not consume or mutate failed turns, or call the boundary reader for a sceneless inquiry', async () => {
    const { context, structured } = setup();
    context.failure = true;
    expect(await new NarrativeBoundaryNode().execute(context)).toEqual({});
    expect(await new ThreadPositionNode().execute(context)).toEqual({});
    expect(await new LocalContinuityNode().execute(context)).toEqual({});
    expect(new ChronicleUpdater().update(context)).toBe(context);
    context.failure = false;
    context.effectiveScene = null;
    context.playerIntent = buildIntent({ intentType: 'inquiry' });
    expect(await new NarrativeBoundaryNode().execute(context)).toEqual({});
    expect(structured).not.toHaveBeenCalled();
  });
});
