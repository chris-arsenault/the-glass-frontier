import type { BeatTracker } from '@glass-frontier/dto';

export const describeBeatTrackerEffect = (tracker: BeatTracker): string | null => {
  const spawned = tracker.newBeat !== null;
  const advanced = tracker.updates.some((update) => update.changeKind === 'advance');
  const resolved = tracker.updates.some((update) => update.changeKind === 'resolve');
  if (spawned && resolved) {
    return 'Resolved & Spawned';
  }
  if (spawned && advanced) {
    return 'Advanced & Spawned';
  }
  if (spawned) {
    return 'Spawned Beat';
  }
  if (resolved) {
    return 'Resolved Beat';
  }
  if (advanced) {
    return 'Advanced Beat';
  }
  return null;
};

export const hasBeatTrackerDetails = (tracker: BeatTracker | null | undefined): boolean =>
  tracker !== null
  && tracker !== undefined
  && (
    tracker.newBeat !== null
    || tracker.focusBeatId !== null
    || tracker.updates.length > 0
  );
