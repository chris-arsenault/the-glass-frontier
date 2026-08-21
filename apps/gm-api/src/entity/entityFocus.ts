import type { EntityFocusState } from '../types';

export type EntityUsageClassification = {
  entityId: string;
  entitySlug: string;
  tags: string[];
  usage: 'unused' | 'mentioned' | 'central';
  emergentTags: string[] | null;
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
    return { entity: 8, tag: 4 };
  }
  if (usage === 'mentioned') {
    return { entity: 3, tag: 1 };
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
  nowTs = Date.now()
): EntityFocusState => {
  const entityScores = decayScores(current?.entityScores);
  const tagScores = decayScores(current?.tagScores);

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
    lastUpdated: nowTs,
    tagScores: Object.fromEntries(tagScores),
  };
};
