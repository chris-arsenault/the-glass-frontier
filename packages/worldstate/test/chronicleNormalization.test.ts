import type { Chronicle } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { normalizeChronicle } from '../src/chronicleNormalization';

describe('normalizeChronicle', () => {
  it('drops obsolete JSON fields and rejects an incompatible old active scene', () => {
    const stored = {
      activeScene: {
        id: 'old-scene',
        subject: 'The old scene subject',
        subjectKind: 'npc',
        type: 'dialog',
      },
      beatTracker: { status: 'in_progress' },
      entityFocus: { entityScores: {}, tagScores: {} },
      entityRoster: {
        entries: [],
        locationName: 'Luminous Quay',
        sceneId: null,
        updatedAtTurn: 0,
      },
      id: 'chronicle-1',
      locationName: 'Luminous Quay',
      openingText: 'The quay lights wake.',
      playerId: 'player-1',
      sceneLedger: { interactions: [] },
      status: 'open',
      title: 'Old Chronicle',
      worldFronts: [{ title: 'Old world machinery' }],
    } as unknown as Chronicle;

    const normalized = normalizeChronicle(stored);

    expect(normalized.activeScene).toBeNull();
    expect(normalized.focusedThreadId).toBeNull();
    expect(normalized.threads).toEqual([]);
    expect(normalized).not.toHaveProperty('beatTracker');
    expect(normalized).not.toHaveProperty('sceneLedger');
    expect(normalized).not.toHaveProperty('worldFronts');
  });
});
