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
    const slug = `beat_${newId}_${context.turnId.slice(0, 8)}`;
    const existingBeat = working.find((beat) => beat.id === newId);
    if (existingBeat !== undefined) {
      log('warn', `Found existing beat for new beat ${existingBeat.id}`);
    } else {
      working.push({
        createdAt: now,
        description: beatTracker.newBeat.description,
        id: toSnakeCase(beatTracker.newBeat.title),
        slug,
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
    return update === undefined
      ? beat
      : {
        ...beat,
        description: update.description ?? beat.description,
        status: update.status ?? beat.status,
        updatedAt: now,
      };
  });
}
