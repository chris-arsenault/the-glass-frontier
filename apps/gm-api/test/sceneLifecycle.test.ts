import { describe, expect, it } from 'vitest';

import {
  buildSceneContext,
  normalizeSceneChange,
  resolveEffectiveScene,
} from '../src/scenes/sceneLifecycle';
import { getSceneTypeDefinition } from '../src/scenes/sceneRegistry';

const AMAYA = 'Amaya Venn';
const RED_COURIER_KITE = 'the red courier kite';

describe('scene lifecycle', () => {
  it('keeps the active scene when the classifier emits no change', () => {
    const activeScene = {
      id: 'scene:1',
      startedAtTurn: 1,
      subject: AMAYA,
      subjectKind: 'npc' as const,
      type: 'dialog' as const,
    };

    expect(resolveEffectiveScene({
      activeScene,
      candidate: null,
      turnId: 'turn-2',
      turnSequence: 2,
    })).toEqual({ effectiveScene: activeScene, sceneChange: null });
  });

  it('starts a typed scene on the triggering turn', () => {
    expect(resolveEffectiveScene({
      activeScene: null,
      candidate: { subject: AMAYA, subjectKind: 'npc', type: 'dialog' },
      turnId: 'turn-4',
      turnSequence: 4,
    })).toEqual({
      effectiveScene: {
        id: 'scene:turn-4',
        startedAtTurn: 4,
        subject: AMAYA,
        subjectKind: 'npc',
        type: 'dialog',
      },
      sceneChange: {
        subject: AMAYA,
        subjectKind: 'npc',
        type: 'dialog',
      },
    });
  });

  it('does not churn the scene when the classifier repeats the same subject', () => {
    const activeScene = {
      id: 'scene:1',
      startedAtTurn: 1,
      subject: AMAYA,
      subjectKind: 'npc' as const,
      type: 'dialog' as const,
    };

    expect(resolveEffectiveScene({
      activeScene,
      candidate: { subject: '  amaya venn ', subjectKind: 'npc', type: 'dialog' },
      turnId: 'turn-3',
      turnSequence: 3,
    })).toEqual({ effectiveScene: activeScene, sceneChange: null });
  });

  it('replaces the active scene when type or subject changes', () => {
    const result = resolveEffectiveScene({
      activeScene: {
        id: 'scene:1',
        startedAtTurn: 1,
        subject: AMAYA,
        subjectKind: 'npc',
        type: 'dialog',
      },
      candidate: { subject: 'Brake Cutters', subjectKind: 'faction', type: 'battle' },
      turnId: 'turn-5',
      turnSequence: 5,
    });

    expect(result.effectiveScene).toMatchObject({
      id: 'scene:turn-5',
      subject: 'Brake Cutters',
      subjectKind: 'faction',
      type: 'battle',
    });
    expect(result.sceneChange?.type).toBe('battle');
  });

  it('degrades a malformed scene candidate to no change', () => {
    expect(normalizeSceneChange({
      subject: RED_COURIER_KITE,
      subjectKind: 'vehicle',
      type: 'chase',
    })).toBeNull();
  });

  it('builds minimal immutable turn context', () => {
    expect(buildSceneContext({
      id: 'scene:9',
      startedAtTurn: 9,
      subject: RED_COURIER_KITE,
      subjectKind: 'transport',
      type: 'chase',
    }, 'complete')).toEqual({
      outcome: 'complete',
      sceneId: 'scene:9',
      subject: RED_COURIER_KITE,
      subjectKind: 'transport',
      type: 'chase',
    });
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
