import type { LoreFragment } from '@glass-frontier/dto';
import { isNonEmptyString } from '@glass-frontier/utils';

import type { GraphContext, LoreContextSlice, LoreFocusState, LoreSnippet } from '../types';

const RECENCY_WINDOW_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

type ScoredFragment = {
  fragment: LoreFragment;
  entityId: string;
  score: number;
};

const summarize = (prose: string, limit = 240): string => {
  const trimmed = prose.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit)}…`;
};

const topTags = (focus: LoreFocusState | null | undefined, count: number): string[] => {
  if (!focus) {
    return [];
  }
  return Object.entries(focus.tagScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([tag]) => tag);
};

const topEntities = (focus: LoreFocusState | null | undefined, count: number): string[] => {
  if (!focus) {
    return [];
  }
  return Object.entries(focus.entityScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([id]) => id);
};

export const buildLoreContext = async (context: GraphContext): Promise<LoreContextSlice> => {
  const anchorId = context.chronicleState.chronicle.anchorEntityId ?? null;
  const focusFromLore = topEntities(context.chronicleState.chronicle.loreFocus, 3);
  const focusSet = new Set<string>();
  if (anchorId) {
    focusSet.add(anchorId);
  }
  focusFromLore.forEach((id) => focusSet.add(id));

  const focusEntities = Array.from(focusSet);
  const focusTags = topTags(context.chronicleState.chronicle.loreFocus, 5);
  const focusTagSet = new Set(focusTags);

  const neighbors = new Set<string>();
  const scored: ScoredFragment[] = [];
  const nowTs = Date.now();

  for (const entityId of focusEntities) {
    if (!isNonEmptyString(entityId)) {
      continue;
    }
    const hardState = await context.worldSchemaStore.getHardState({ id: entityId });
    if (hardState) {
      hardState.links?.forEach((link) => neighbors.add(link.targetId));
    }
    const frags = await context.worldSchemaStore.listLoreFragmentsByEntity({ entityId, limit: 5 });
    for (const fragment of frags) {
      const score =
        (anchorId === entityId ? 3 : 0) +
        (focusEntities.includes(entityId) ? 2 : 0) +
        (focusTagSet.size > 0
          ? fragment.tags.filter((tag) => focusTagSet.has(tag)).length
          : 0) +
        (fragment.timestamp && nowTs - fragment.timestamp < RECENCY_WINDOW_MS ? 1 : 0);
      scored.push({ fragment, entityId, score });
    }
  }

  // neighbor fragments (1-hop) if none found for primary focus
  for (const neighbor of neighbors) {
    const frags = await context.worldSchemaStore.listLoreFragmentsByEntity({ entityId: neighbor, limit: 2 });
    for (const fragment of frags) {
      scored.push({ fragment, entityId: neighbor, score: 1 });
    }
  }

  const dedup = new Map<string, ScoredFragment>();
  for (const entry of scored) {
    const prev = dedup.get(entry.fragment.id);
    if (!prev || prev.score < entry.score) {
      dedup.set(entry.fragment.id, entry);
    }
  }

  const top = Array.from(dedup.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);

  const offered: LoreSnippet[] = top.map((entry) => ({
    entityId: entry.entityId,
    id: entry.fragment.id,
    summary: summarize(entry.fragment.prose ?? ''),
    tags: entry.fragment.tags ?? [],
    title: entry.fragment.title,
    score: entry.score,
  }));

  return {
    offered,
    focusEntities,
    focusTags,
  };
};
