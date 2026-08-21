import type { BeatTracker, ChronicleBeat } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import type { GraphContext } from '../src/types';
import { createUpdatedBeats } from '../src/updaters/beatUpdater';
import { buildContext } from './harness';

const buildBeat = (overrides?: Partial<ChronicleBeat>): ChronicleBeat => ({
  createdAt: 1,
  description: 'Trace the relay sabotage to its source.',
  id: 'trace_the_sabotage',
  status: 'in_progress',
  title: 'Trace the Sabotage',
  updatedAt: 1,
  ...overrides,
});

const contextWithTracker = (
  beats: ChronicleBeat[],
  beatTracker: BeatTracker | undefined
): GraphContext => {
  const context = buildContext({ beatTracker });
  context.chronicleState.chronicle.beats = beats;
  return context;
};

describe('createUpdatedBeats', () => {
  it('returns the existing beats when no tracker ran', () => {
    const beats = [buildBeat()];
    expect(createUpdatedBeats(contextWithTracker(beats, undefined))).toEqual(beats);
  });

  it('spawns a new beat with a snake_case id derived from the title', () => {
    const tracker: BeatTracker = {
      focusBeatId: null,
      newBeat: { description: 'Find the hidden dock.', title: 'The Hidden Dock' },
      tags: [],
      updates: [],
    };
    const beats = createUpdatedBeats(contextWithTracker([], tracker));
    expect(beats).toHaveLength(1);
    expect(beats[0]?.id).toBe('the_hidden_dock');
    expect(beats[0]?.status).toBe('in_progress');
  });

  it('does not duplicate a beat whose title already exists', () => {
    const tracker: BeatTracker = {
      focusBeatId: null,
      newBeat: { description: 'Again.', title: 'Trace the Sabotage' },
      tags: [],
      updates: [],
    };
    const beats = createUpdatedBeats(contextWithTracker([buildBeat()], tracker));
    expect(beats).toHaveLength(1);
  });

  it('applies updates matched by beat id and stamps resolvedAt on resolution', () => {
    const tracker: BeatTracker = {
      focusBeatId: 'trace_the_sabotage',
      newBeat: null,
      tags: [],
      updates: [
        {
          beatId: 'trace_the_sabotage',
          changeKind: 'resolve',
          description: null,
          status: 'succeeded',
        },
      ],
    };
    const beats = createUpdatedBeats(contextWithTracker([buildBeat()], tracker));
    expect(beats[0]?.status).toBe('succeeded');
    expect(typeof beats[0]?.resolvedAt).toBe('number');
  });

  it('leaves beats untouched for updates naming an unknown id', () => {
    const tracker: BeatTracker = {
      focusBeatId: null,
      newBeat: null,
      tags: [],
      updates: [
        { beatId: 'no_such_beat', changeKind: 'advance', description: null, status: null },
      ],
    };
    const beats = createUpdatedBeats(contextWithTracker([buildBeat()], tracker));
    expect(beats[0]?.status).toBe('in_progress');
    expect(beats[0]?.resolvedAt).toBeUndefined();
  });
});
