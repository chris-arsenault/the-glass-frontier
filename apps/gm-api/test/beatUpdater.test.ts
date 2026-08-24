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

  it('stamps lastProgressTurn when a beat advances', () => {
    const tracker: BeatTracker = {
      focusBeatId: 'trace_the_sabotage',
      newBeat: null,
      tags: [],
      updates: [
        { beatId: 'trace_the_sabotage', changeKind: 'advance', description: null, status: null },
      ],
    };
    const context = contextWithTracker([buildBeat()], tracker);
    const beats = createUpdatedBeats(context);
    expect(beats[0]?.lastProgressTurn).toBe(context.turnSequence);
    expect(beats[0]?.status).toBe('in_progress');
  });

  it('abandons a beat regardless of the reported status', () => {
    const tracker: BeatTracker = {
      focusBeatId: null,
      newBeat: null,
      tags: [],
      updates: [
        { beatId: 'trace_the_sabotage', changeKind: 'abandon', description: null, status: null },
      ],
    };
    const beats = createUpdatedBeats(contextWithTracker([buildBeat()], tracker));
    expect(beats[0]?.status).toBe('abandoned');
    expect(typeof beats[0]?.resolvedAt).toBe('number');
  });

  it('supersedes an open beat with the newly spawned one', () => {
    const tracker: BeatTracker = {
      focusBeatId: null,
      newBeat: {
        description: 'Escape before the relay lockdown.',
        supersedes: 'trace_the_sabotage',
        title: 'Escape the Lockdown',
      },
      tags: [],
      updates: [],
    };
    const beats = createUpdatedBeats(contextWithTracker([buildBeat()], tracker));
    const old = beats.find((beat) => beat.id === 'trace_the_sabotage');
    const successor = beats.find((beat) => beat.id === 'escape_the_lockdown');
    expect(old?.status).toBe('superseded');
    expect(old?.supersededBy).toBe('escape_the_lockdown');
    expect(successor?.status).toBe('in_progress');
  });

  it('never supersedes a beat that is already terminal', () => {
    const tracker: BeatTracker = {
      focusBeatId: null,
      newBeat: {
        description: 'Again, but different.',
        supersedes: 'trace_the_sabotage',
        title: 'A New Thread',
      },
      tags: [],
      updates: [],
    };
    const beats = createUpdatedBeats(
      contextWithTracker([buildBeat({ resolvedAt: 5, status: 'succeeded' })], tracker)
    );
    const old = beats.find((beat) => beat.id === 'trace_the_sabotage');
    expect(old?.status).toBe('succeeded');
    expect(old?.supersededBy).toBeUndefined();
  });
});
