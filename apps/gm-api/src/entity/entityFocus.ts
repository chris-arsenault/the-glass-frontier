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
    for (const emergent of entry.emergentTags ?? []) {
      const normalized = emergent.trim().toLowerCase();
      if (normalized.length > 0) {
        addScore(tagScores, normalized, 2);
      }
    }
  }

  return {
    entityScores: Object.fromEntries(entityScores),
    lastUpdated: nowTs,
    tagScores: Object.fromEntries(tagScores),
  };
};
