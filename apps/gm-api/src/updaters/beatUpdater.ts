import type { ChronicleBeat } from '@glass-frontier/dto';
import { TERMINAL_BEAT_STATUSES } from '@glass-frontier/dto';
import type { GraphContext } from '@glass-frontier/gm-api/types';
import { log, toSnakeCase } from '@glass-frontier/utils';

type BeatUpdate = NonNullable<GraphContext['beatTracker']>['updates'][number];

const spawnBeat = (
  working: ChronicleBeat[],
  newBeat: { description: string; title: string },
  turnSequence: number,
  now: number
): string => {
  const newId = toSnakeCase(newBeat.title);
  const existingBeat = working.find((beat) => toSnakeCase(beat.title) === newId);
  if (existingBeat !== undefined) {
    log('warn', `Found existing beat for new beat ${existingBeat.id}`);
    return existingBeat.id;
  }
  working.push({
    createdAt: now,
    description: newBeat.description,
    id: newId,
    lastProgressTurn: turnSequence,
    status: 'in_progress',
    title: newBeat.title,
    updatedAt: now,
  });
  return newId;
};

const supersedeBeat = (
  working: ChronicleBeat[],
  supersededId: string,
  successorId: string,
  now: number
): void => {
  const target = working.find((beat) => beat.id === supersededId);
  if (target === undefined || supersededId === successorId) {
    log('warn', 'Supersession target not found or self-referential', {
      successorId,
      supersededId,
    });
    return;
  }
  if (TERMINAL_BEAT_STATUSES.has(target.status)) {
    return;
  }
  target.resolvedAt = target.resolvedAt ?? now;
  target.status = 'superseded';
  target.supersededBy = successorId;
  target.updatedAt = now;
};

const applyUpdate = (
  beat: ChronicleBeat,
  update: BeatUpdate,
  turnSequence: number,
  now: number
): ChronicleBeat => {
  const status =
    update.changeKind === 'abandon' ? 'abandoned' : update.status ?? beat.status;
  const terminal = TERMINAL_BEAT_STATUSES.has(status);
  return {
    ...beat,
    description: update.description ?? beat.description,
    lastProgressTurn:
      update.changeKind === 'advance' ? turnSequence : beat.lastProgressTurn,
    resolvedAt: terminal ? beat.resolvedAt ?? now : beat.resolvedAt,
    status,
    updatedAt: now,
  };
};

export function createUpdatedBeats(context: GraphContext): ChronicleBeat[] {
  const { beatTracker } = context;
  const now = Date.now();
  if (beatTracker === undefined) {
    return context.chronicleState.chronicle.beats;
  }

  const working = structuredClone(context.chronicleState.chronicle.beats);
  if (beatTracker.newBeat !== null && beatTracker.newBeat !== undefined) {
    const successorId = spawnBeat(working, beatTracker.newBeat, context.turnSequence, now);
    const supersedes = beatTracker.newBeat.supersedes;
    if (supersedes !== null && supersedes !== undefined) {
      supersedeBeat(working, supersedes, successorId, now);
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
    return applyUpdate(beat, update, context.turnSequence, now);
  });
}
