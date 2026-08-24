import type { ChronicleBeat } from '@glass-frontier/dto';

import { isNonEmptyString } from './utils';

/**
 * The seed is the chronicle's founding beat: the story's initial goal, born
 * in_progress and as mortal as any other beat — play may resolve, supersede,
 * or abandon it.
 */
export const foundingBeats = (
  title: string | undefined,
  seedText: string | null | undefined
): ChronicleBeat[] => {
  if (!isNonEmptyString(seedText)) {
    return [];
  }
  const now = Date.now();
  return [
    {
      createdAt: now,
      description: seedText,
      id: 'founding_beat',
      status: 'in_progress',
      title: title ?? 'The Founding Thread',
      updatedAt: now,
    },
  ];
};
