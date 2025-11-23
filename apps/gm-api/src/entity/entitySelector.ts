import type { HardState } from '@glass-frontier/dto';
import { isNonEmptyString } from '@glass-frontier/utils';

import type { GraphContext, EntityContextSlice, EntityFocusState, EntitySnippet } from '../types';

const RECENCY_WINDOW_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

type ScoredEntity = {
  entity: HardState;
  score: number;
};

const summarize = (prose: string, limit = 240): string => {
  const trimmed = prose.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit)}…`;
};

const topTags = (focus: EntityFocusState | null | undefined, count: number): string[] => {
  if (!focus) {
    return [];
  }
  return Object.entries(focus.tagScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([tag]) => tag);
};

const topEntities = (focus: EntityFocusState | null | undefined, count: number): string[] => {
  if (!focus) {
    return [];
  }
  return Object.entries(focus.entityScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([id]) => id);
};

export const buildEntityContext = async (context: GraphContext): Promise<EntityContextSlice> => {
  const anchorId = context.chronicleState.chronicle.anchorEntityId ?? null;
  const focusFromEntity = topEntities(context.chronicleState.chronicle.entityFocus, 3);
  const focusSet = new Set<string>();
  if (anchorId) {
    focusSet.add(anchorId);
  }
  focusFromEntity.forEach((id) => focusSet.add(id));

  const focusEntities = Array.from(focusSet);
  const focusTags = topTags(context.chronicleState.chronicle.entityFocus, 5);
  const focusTagSet = new Set(focusTags);

  const neighbors = new Set<string>();
  const scored: ScoredEntity[] = [];
  const nowTs = Date.now();

  // Score primary focus entities
  for (const entityId of focusEntities) {
    if (!isNonEmptyString(entityId)) {
      continue;
    }
    const entity = await context.worldSchemaStore.getEntity({ id: entityId });
    if (!entity) {
      continue;
    }

    // Collect neighbors for fallback
    entity.links?.forEach((link) => neighbors.add(link.targetId));

    // Get entity's lore fragments to calculate tag overlap score
    const frags = await context.worldSchemaStore.listLoreFragmentsByEntity({ entityId, limit: 5 });
    const entityTags = new Set(frags.flatMap((f) => f.tags ?? []));
    const tagOverlap = focusTagSet.size > 0
      ? Array.from(focusTagSet).filter((tag) => entityTags.has(tag)).length
      : 0;

    const hasRecentLore = frags.some((f) => f.timestamp && nowTs - f.timestamp < RECENCY_WINDOW_MS);

    const score =
      (anchorId === entityId ? 5 : 0) +
      (focusEntities.includes(entityId) ? 3 : 0) +
      tagOverlap +
      (hasRecentLore ? 1 : 0);

    scored.push({ entity, score });
  }

  // Add neighbor entities as fallback if needed
  for (const neighborId of neighbors) {
    const entity = await context.worldSchemaStore.getEntity({ id: neighborId });
    if (!entity) {
      continue;
    }
    scored.push({ entity, score: 1 });
  }

  // Deduplicate and sort
  const dedup = new Map<string, ScoredEntity>();
  for (const entry of scored) {
    const prev = dedup.get(entry.entity.id);
    if (!prev || prev.score < entry.score) {
      dedup.set(entry.entity.id, entry);
    }
  }

  const top = Array.from(dedup.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);

  // Build entity snippets with nested lore
  const offered: EntitySnippet[] = [];
  for (const entry of top) {
    const frags = await context.worldSchemaStore.listLoreFragmentsByEntity({
      entityId: entry.entity.id,
      limit: 1,
    });

    offered.push({
      id: entry.entity.id,
      slug: entry.entity.slug,
      name: entry.entity.name,
      kind: entry.entity.kind,
      subkind: entry.entity.subkind,
      description: entry.entity.description,
      status: entry.entity.status,
      tags: Array.from(new Set(frags.flatMap((f) => f.tags ?? []))),
      loreFragments: frags.map((f) => ({
        slug: f.slug,
        title: f.title,
        summary: summarize(f.prose ?? '', 80),
        tags: f.tags ?? [],
      })),
      score: entry.score,
    });
  }

  return {
    offered,
    focusEntities,
    focusTags,
  };
};
