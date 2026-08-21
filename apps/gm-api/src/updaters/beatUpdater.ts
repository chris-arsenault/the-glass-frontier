import type { ChronicleBeat } from '@glass-frontier/dto';
import type { GraphContext } from '@glass-frontier/gm-api/types';
import { log, toSnakeCase } from '@glass-frontier/utils';

export function createUpdatedBeats(context: GraphContext): ChronicleBeat[] {
  const { beatTracker } = context;
  const now = Date.now();
  if (beatTracker === undefined) {
    return context.chronicleState.chronicle.beats;
  }

  const working = structuredClone(context.chronicleState.chronicle.beats);
  if (beatTracker.newBeat !== null && beatTracker.newBeat !== undefined) {
    const newId = toSnakeCase(beatTracker.newBeat.title);
    const existingBeat = working.find((beat) => toSnakeCase(beat.title) === newId);
    if (existingBeat !== undefined) {
      log('warn', `Found existing beat for new beat ${existingBeat.id}`);
    } else {
      working.push({
        createdAt: now,
        description: beatTracker.newBeat.description,
        id: newId,
        status: 'in_progress',
        title: beatTracker.newBeat.title,
        updatedAt: now,
      });
    }
  }

  const updates = new Map(beatTracker.updates.map((update) => [update.beatId, update]));
  const existingIds = new Set(working.map((beat) => beat.id));
  beatTracker.updates
    .filter((update) => !existingIds.has(update.beatId))
    .forEach((update) => log('warn', `Got update for non-existent beat ${update.beatId}`));
  return working.map((beat) => {
    const update = updates.get(beat.id);
    if (update === undefined) {
      return beat;
    }
    const status = update.status ?? beat.status;
    const resolved = status === 'succeeded' || status === 'failed';
    return {
      ...beat,
      description: update.description ?? beat.description,
      resolvedAt: resolved ? beat.resolvedAt ?? now : beat.resolvedAt,
      status,
      updatedAt: now,
    };
  });
}
