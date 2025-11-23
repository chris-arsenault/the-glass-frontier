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

export const applyEntityUsage = (
  current: EntityFocusState | null | undefined,
  usage: EntityUsageClassification[],
  nowTs = Date.now()
): EntityFocusState => {
  const next: EntityFocusState = {
    entityScores: { ...(current?.entityScores ?? {}) },
    tagScores: { ...(current?.tagScores ?? {}) },
    lastUpdated: nowTs,
  };

  // Passive decay
  Object.keys(next.entityScores).forEach((key) => {
    next.entityScores[key] = clampScore(next.entityScores[key] * DECAY);
  });
  Object.keys(next.tagScores).forEach((key) => {
    next.tagScores[key] = clampScore(next.tagScores[key] * DECAY);
  });

  for (const entry of usage) {
    const entityBump = entry.usage === 'central' ? 8 : entry.usage === 'mentioned' ? 3 : 0;
    const tagBump = entry.usage === 'central' ? 4 : entry.usage === 'mentioned' ? 1 : 0;

    if (entityBump > 0) {
      next.entityScores[entry.entityId] = clampScore((next.entityScores[entry.entityId] ?? 0) + entityBump);
    }
    for (const tag of entry.tags ?? []) {
      next.tagScores[tag] = clampScore((next.tagScores[tag] ?? 0) + tagBump);
    }
    for (const emergent of entry.emergentTags ?? []) {
      const normalized = emergent.trim().toLowerCase();
      if (!normalized) {
        continue;
      }
      next.tagScores[normalized] = clampScore((next.tagScores[normalized] ?? 0) + 2);
    }
  }

  return next;
};
