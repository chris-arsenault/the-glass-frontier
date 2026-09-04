import { describe, expect, it } from 'vitest';

import { projectScene } from '../src/scenes/boundedScene';

describe('bounded scenes', () => {
  it('opens with four consequential turns and consumes the opening action', () => {
    const result = projectScene({
      activeScene: null,
      directive: { action: 'open', question: 'Can Vex cross the sealed gallery?', type: 'search' },
      focusedThreadId: 'thread-1',
      intentType: 'action',
      turnId: 'turn-1',
    });

    expect(result).toEqual({
      boundary: false,
      effectiveScene: {
        id: 'turn-1',
        question: 'Can Vex cross the sealed gallery?',
        threadId: 'thread-1',
        turnsRemaining: 3,
        type: 'search',
      },
      willClose: false,
    });
  });

  it('does not consume scene time for inquiry', () => {
    const activeScene = {
      id: 'scene-1',
      question: 'Will the factor yield?',
      threadId: 'thread-1',
      turnsRemaining: 2,
      type: 'dialog' as const,
    };

    expect(projectScene({
      activeScene,
      directive: { action: 'continue' },
      focusedThreadId: 'thread-1',
      intentType: 'inquiry',
      turnId: 'turn-2',
    })).toEqual({ boundary: false, effectiveScene: activeScene, willClose: false });
  });

  it('marks the final consequential turn as a boundary', () => {
    const result = projectScene({
      activeScene: {
        id: 'scene-1',
        question: 'Will the factor yield?',
        threadId: 'thread-1',
        turnsRemaining: 1,
        type: 'dialog',
      },
      directive: { action: 'continue' },
      focusedThreadId: 'thread-1',
      intentType: 'action',
      turnId: 'turn-4',
    });

    expect(result.boundary).toBe(true);
    expect(result.willClose).toBe(true);
    expect(result.effectiveScene?.turnsRemaining).toBe(0);
  });
});
