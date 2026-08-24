import { describe, expect, it } from 'vitest';

import {
  advanceSceneClock,
  buildSceneContext,
  isSceneClockFull,
  normalizeSceneChange,
  resolveEffectiveScene,
} from '../src/scenes/sceneLifecycle';
import { getSceneTypeDefinition } from '../src/scenes/sceneRegistry';

const AMAYA = 'Amaya Venn';
const RED_COURIER_KITE = 'the red courier kite';
const QUAY = 'Luminous Quay';

const dialogScene = (): {
  id: string;
  location: string;
  progress: number;
  progressTarget: number;
  startedAtTurn: number;
  subject: string;
  subjectKind: 'npc';
  type: 'dialog';
} => ({
  id: 'scene:1',
  location: QUAY,
  progress: 0,
  progressTarget: 4,
  startedAtTurn: 1,
  subject: AMAYA,
  subjectKind: 'npc' as const,
  type: 'dialog' as const,
});

describe('scene lifecycle', () => {
  it('keeps the active scene when the classifier emits no change', () => {
    const activeScene = dialogScene();

    expect(resolveEffectiveScene({
      activeScene,
      candidate: null,
      locationName: QUAY,
      turnId: 'turn-2',
      turnSequence: 2,
    })).toEqual({
      effectiveScene: activeScene,
      replacedSceneId: null,
      sceneChange: null,
      transition: 'none',
    });
  });

  it('starts a typed scene bound to the current location', () => {
    expect(resolveEffectiveScene({
      activeScene: null,
      candidate: { subject: AMAYA, subjectKind: 'npc', type: 'dialog' },
      locationName: QUAY,
      turnId: 'turn-4',
      turnSequence: 4,
    })).toEqual({
      effectiveScene: {
        id: 'scene:turn-4',
        location: QUAY,
        progress: 0,
        progressTarget: 4,
        startedAtTurn: 4,
        subject: AMAYA,
        subjectKind: 'npc',
        type: 'dialog',
      },
      replacedSceneId: null,
      sceneChange: {
        subject: AMAYA,
        subjectKind: 'npc',
        type: 'dialog',
      },
      transition: 'started',
    });
  });

  it('does not churn the scene when the classifier repeats the same subject', () => {
    const activeScene = dialogScene();

    expect(resolveEffectiveScene({
      activeScene,
      candidate: { subject: '  amaya venn ', subjectKind: 'npc', type: 'dialog' },
      locationName: QUAY,
      turnId: 'turn-3',
      turnSequence: 3,
    })).toEqual({
      effectiveScene: activeScene,
      replacedSceneId: null,
      sceneChange: null,
      transition: 'continuation',
    });
  });

  it('replaces the active scene when type or subject changes', () => {
    const result = resolveEffectiveScene({
      activeScene: dialogScene(),
      candidate: { subject: 'Brake Cutters', subjectKind: 'faction', type: 'battle' },
      locationName: QUAY,
      turnId: 'turn-5',
      turnSequence: 5,
    });

    expect(result.effectiveScene).toMatchObject({
      id: 'scene:turn-5',
      location: QUAY,
      progress: 0,
      subject: 'Brake Cutters',
      subjectKind: 'faction',
      type: 'battle',
    });
    expect(result.sceneChange?.type).toBe('battle');
    expect(result.transition).toBe('replaced');
    expect(result.replacedSceneId).toBe('scene:1');
  });

  it('degrades a malformed scene candidate to no change', () => {
    expect(normalizeSceneChange({
      subject: RED_COURIER_KITE,
      subjectKind: 'vehicle',
      type: 'chase',
    })).toBeNull();
  });

  it('distinguishes a malformed candidate from no candidate', () => {
    const malformed = resolveEffectiveScene({
      activeScene: null,
      candidate: { subject: RED_COURIER_KITE, subjectKind: 'vehicle', type: 'chase' },
      locationName: QUAY,
      turnId: 'turn-6',
      turnSequence: 6,
    });

    expect(malformed.transition).toBe('parse_failed');
    expect(malformed.effectiveScene).toBeNull();
  });

  it('moves the scene clock by check outcome and clamps at the edges', () => {
    const scene = dialogScene();

    expect(advanceSceneClock(scene, 'breakthrough').progress).toBe(2);
    expect(advanceSceneClock(scene, 'advance').progress).toBe(1);
    expect(advanceSceneClock(scene, 'stall')).toBe(scene);
    expect(advanceSceneClock(scene, 'regress').progress).toBe(0);
    expect(advanceSceneClock(scene, undefined)).toBe(scene);
    expect(
      advanceSceneClock({ ...scene, progress: 3 }, 'breakthrough').progress
    ).toBe(4);
    expect(isSceneClockFull({ ...scene, progress: 4 })).toBe(true);
    expect(isSceneClockFull(scene)).toBe(false);
  });

  it('builds minimal immutable turn context', () => {
    expect(buildSceneContext({
      ...dialogScene(),
      id: 'scene:9',
      startedAtTurn: 9,
      subject: RED_COURIER_KITE,
      subjectEntityId: '11111111-2222-4333-8444-555555555555',
      subjectKind: 'transport',
      type: 'chase',
    }, 'complete')).toEqual({
      outcome: 'complete',
      sceneId: 'scene:9',
      subject: RED_COURIER_KITE,
      subjectEntityId: '11111111-2222-4333-8444-555555555555',
      subjectKind: 'transport',
      type: 'chase',
    });
  });

  it('carries the completion reason onto the turn context', () => {
    const scene = {
      ...dialogScene(),
      id: 'scene:9',
      startedAtTurn: 9,
      subject: RED_COURIER_KITE,
      subjectKind: 'transport' as const,
      type: 'chase' as const,
    };

    expect(buildSceneContext(scene, 'complete', 'The kite was caught.')?.outcomeReason).toBe(
      'The kite was caught.'
    );
    expect(buildSceneContext(scene, 'continue', 'ignored')?.outcomeReason).toBeUndefined();
    expect(buildSceneContext(scene, 'abandoned')?.outcome).toBe('abandoned');
  });

  it('registers a distinct policy and presentation for every scene type', () => {
    expect([
      getSceneTypeDefinition('dialog'),
      getSceneTypeDefinition('battle'),
      getSceneTypeDefinition('hunt'),
      getSceneTypeDefinition('chase'),
      getSceneTypeDefinition('search'),
    ].map((definition) => definition.promptTemplateId)).toEqual([
      'scene-dialog',
      'scene-battle',
      'scene-hunt',
      'scene-chase',
      'scene-search',
    ]);
  });
});
