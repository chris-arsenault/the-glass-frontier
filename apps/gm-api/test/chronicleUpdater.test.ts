import { describe, expect, it } from 'vitest';

import { ChronicleUpdater } from '../src/updaters/ChronicleUpdater';
import { buildContext } from './harness';

const PLAYER_THREAD_ID = 'player-thread';

describe('ChronicleUpdater', () => {
  it('applies thread positions, local continuity, and scene closure together', () => {
    const context = buildContext({
      effectiveFocusedThreadId: PLAYER_THREAD_ID,
      effectiveScene: {
        id: 'scene-1',
        question: 'Can Vex cross the sealed gallery?',
        threadId: PLAYER_THREAD_ID,
        turnsRemaining: 0,
        type: 'search',
      },
      effectiveThreads: [
        {
          goal: 'Reach the relay.',
          id: PLAYER_THREAD_ID,
          owner: 'Vex',
          perspective: 'player',
          position: 'The gallery blocks the way.',
          title: 'Reach the relay',
          updatedAtTurn: 0,
        },
        {
          goal: 'Seal the relay.',
          id: 'world-thread',
          owner: 'The factor',
          perspective: 'world',
          position: 'The seals are incomplete.',
          title: 'Seal the relay',
          updatedAtTurn: 0,
        },
      ],
      localContinuityUpdate: {
        locationName: 'The Splinter Yards',
        note: 'The gallery door hangs open behind Vex.',
        updatedAtTurn: 1,
      },
      sceneBoundary: true,
      sceneWillClose: true,
      threadPositionUpdate: {
        position: 'Vex has crossed the gallery.',
        threadId: PLAYER_THREAD_ID,
      },
      worldThreadUpdate: {
        position: 'The factor seals the inner relay instead.',
        threadId: 'world-thread',
      },
    });

    const result = new ChronicleUpdater().update(context);

    expect(result.chronicleState.chronicle.activeScene).toBeNull();
    expect(result.chronicleState.chronicle.localContinuity?.note).toContain('door hangs open');
    expect(result.chronicleState.chronicle.threads.map((thread) => thread.position)).toEqual([
      'Vex has crossed the gallery.',
      'The factor seals the inner relay instead.',
    ]);
  });
});
