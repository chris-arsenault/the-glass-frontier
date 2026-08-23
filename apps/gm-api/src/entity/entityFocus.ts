import type { EntityFocusState } from '../types';

export type EntityUsageClassification = {
  entityId: string;
  entitySlug: string;
  tags: string[];
  usage: 'unused' | 'mentioned' | 'central';
  emergentTags: string[] | null;
};

export type PlayerEntityReference = {
  entityId: string;
  tags: string[];
};

const DECAY = 0.9;

const clampScore = (value: number): number => Math.max(-50, Math.min(100, value));

const decayScores = (scores: Record<string, number> | undefined): Map<string, number> =>
  new Map(
    Object.entries(scores ?? {}).map(([key, value]) => [key, clampScore(value * DECAY)])
  );

const addScore = (scores: Map<string, number>, key: string, amount: number): void => {
  scores.set(key, clampScore((scores.get(key) ?? 0) + amount));
};

const usageBumps = (
  usage: EntityUsageClassification['usage']
): { entity: number; tag: number } => {
  if (usage === 'central') {
    return { entity: 4, tag: 2 };
  }
  if (usage === 'mentioned') {
    return { entity: 2, tag: 1 };
  }
  return { entity: 0, tag: 0 };
};

/**
 * Folds this turn's usage into the chronicle's focus.
 *
 * Only tags that already exist on lore fragments are scored. The judge's
 * `emergentTags` are free text describing themes the world has no vocabulary
 * for yet, so scoring them against authored tags could never match anything —
 * they are kept on the turn record (`entity_usage`) where a later pass can use
 * them, and left out of retrieval scoring.
 */
export const applyEntityUsage = (
  current: EntityFocusState | null | undefined,
  usage: EntityUsageClassification[],
  playerReferences: PlayerEntityReference[] = []
): EntityFocusState => {
  const entityScores = decayScores(current?.entityScores);
  const tagScores = decayScores(current?.tagScores);

  const uniquePlayerReferences = playerReferences.filter((entry, index, all) =>
    all.findIndex((candidate) => candidate.entityId === entry.entityId) === index);
  for (const entry of uniquePlayerReferences) {
    addScore(entityScores, entry.entityId, 8);
    for (const tag of entry.tags) {
      addScore(tagScores, tag, 3);
    }
  }

  for (const entry of usage) {
    const bumps = usageBumps(entry.usage);
    if (bumps.entity > 0) {
      addScore(entityScores, entry.entityId, bumps.entity);
    }
    for (const tag of entry.tags) {
      addScore(tagScores, tag, bumps.tag);
    }
  }

  return {
    entityScores: Object.fromEntries(entityScores),
    tagScores: Object.fromEntries(tagScores),
  };
};
