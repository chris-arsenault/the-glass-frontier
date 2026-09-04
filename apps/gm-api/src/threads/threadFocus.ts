import type { NarrativeThread, ThreadFocusDirective } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';

export type ThreadProjection = {
  focusedThreadId: string | null;
  threads: NarrativeThread[];
};

const normalizeTitle = (title: string): string =>
  title.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();

const currentPlayerFocus = (
  threads: NarrativeThread[],
  focusedThreadId: string | null
): string | null => {
  const focused = threads.find(
    (thread) => thread.id === focusedThreadId && thread.perspective === 'player'
  );
  return focused?.id ?? threads.find((thread) => thread.perspective === 'player')?.id ?? null;
};

/** Applies only explicit player-goal changes; inactivity never changes focus. */
export const projectThreadFocus = (input: {
  characterName: string;
  directive: ThreadFocusDirective;
  focusedThreadId: string | null;
  threads: NarrativeThread[];
  turnSequence: number;
}): ThreadProjection => {
  const threads = [...input.threads];
  const existingFocus = currentPlayerFocus(threads, input.focusedThreadId);
  if (input.directive.action === 'keep') {
    return { focusedThreadId: existingFocus, threads };
  }
  if (input.directive.action === 'focus') {
    const { title } = input.directive;
    const focused = threads.find(
      (thread) => thread.perspective === 'player'
        && normalizeTitle(thread.title) === normalizeTitle(title)
    );
    return { focusedThreadId: focused?.id ?? existingFocus, threads };
  }

  const { goal, title } = input.directive;
  const duplicate = threads.find(
    (thread) => thread.perspective === 'player'
      && normalizeTitle(thread.title) === normalizeTitle(title)
  );
  if (duplicate !== undefined) {
    return { focusedThreadId: duplicate.id, threads };
  }
  const created: NarrativeThread = {
    goal: goal.trim(),
    id: randomUUID(),
    owner: input.characterName,
    perspective: 'player',
    position: 'The player has just established this as their current goal.',
    title: title.trim(),
    updatedAtTurn: input.turnSequence,
  };
  return { focusedThreadId: created.id, threads: [...threads, created] };
};
