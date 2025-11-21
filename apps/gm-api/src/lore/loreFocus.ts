import type { LoreFocusState } from '../types';

export type LoreUsageClassification = {
  fragmentId: string;
  entityId: string;
  tags: string[];
  usage: 'unused' | 'glanced' | 'grounding';
  emergentTags?: string[];
};

const DECAY = 0.9;

const clampScore = (value: number): number => Math.max(-50, Math.min(100, value));

export const applyLoreUsage = (
  current: LoreFocusState | null | undefined,
  usage: LoreUsageClassification[],
  nowTs = Date.now()
): LoreFocusState => {
  const next: LoreFocusState = {
    entityScores: { ...(current?.entityScores ?? {}) },
    tagScores: { ...(current?.tagScores ?? {}) },
    lastUpdated: nowTs,
  };

  // passive decay
  Object.keys(next.entityScores).forEach((key) => {
    next.entityScores[key] = clampScore(next.entityScores[key] * DECAY);
  });
  Object.keys(next.tagScores).forEach((key) => {
    next.tagScores[key] = clampScore(next.tagScores[key] * DECAY);
  });

  for (const entry of usage) {
    const entityBump = entry.usage === 'grounding' ? 5 : entry.usage === 'glanced' ? 2 : 0;
    const tagBump = entry.usage === 'grounding' ? 3 : entry.usage === 'glanced' ? 1 : 0;

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
      next.tagScores[normalized] = clampScore((next.tagScores[normalized] ?? 0) + 1);
    }
  }

  return next;
};
