import type { NarrativeThread, WorldThreadSeed } from '@glass-frontier/dto';
import { isNonEmptyString } from '@glass-frontier/utils';
import { randomUUID } from 'node:crypto';

export type FoundingThreads = {
  focusedThreadId: string | null;
  threads: NarrativeThread[];
};

/** Creates the two durable directions authored by a Chronicle seed. */
export const foundingThreads = (
  title: string,
  playerGoal: string | null | undefined,
  worldThread: WorldThreadSeed | null | undefined
): FoundingThreads => {
  const threads: NarrativeThread[] = [];
  let focusedThreadId: string | null = null;

  if (isNonEmptyString(playerGoal)) {
    focusedThreadId = randomUUID();
    threads.push({
      goal: playerGoal.trim(),
      id: focusedThreadId,
      owner: 'Player',
      perspective: 'player',
      position: 'The goal is established; no bounded scene has changed the player\'s position yet.',
      title: title.trim(),
      updatedAtTurn: 0,
    });
  }

  if (worldThread !== null && worldThread !== undefined) {
    threads.push({
      ...worldThread,
      id: randomUUID(),
      perspective: 'world',
      updatedAtTurn: 0,
    });
  }

  return { focusedThreadId, threads };
};
