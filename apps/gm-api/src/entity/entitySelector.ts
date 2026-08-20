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
  if (focus === null || focus === undefined) {
    return [];
  }
  return Object.entries(focus.tagScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([tag]) => tag);
};

const topEntities = (focus: EntityFocusState | null | undefined, count: number): string[] => {
  if (focus === null || focus === undefined) {
    return [];
  }
  return Object.entries(focus.entityScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([id]) => id);
};

type FocusedEntityResult = {
  neighborIds: string[];
  scored: ScoredEntity | null;
};

type FocusScoring = {
  anchorId: string | undefined;
  focusEntities: string[];
  focusTags: Set<string>;
  nowTs: number;
};

const loadFocusedEntity = async (
  context: GraphContext,
  entityId: string,
  scoring: FocusScoring
): Promise<FocusedEntityResult> => {
  if (!isNonEmptyString(entityId)) {
    return { neighborIds: [], scored: null };
  }
  const entity = await context.worldSchemaStore.getEntity({ id: entityId });
  if (entity === null) {
    return { neighborIds: [], scored: null };
  }
  const fragments = await context.worldSchemaStore.listLoreFragmentsByEntity({
    entityId,
    limit: 5,
  });
  const entityTags = new Set(fragments.flatMap((fragment) => fragment.tags));
  const tagOverlap = Array.from(scoring.focusTags)
    .filter((tag) => entityTags.has(tag)).length;
  const hasRecentLore = fragments.some(
    (fragment) => scoring.nowTs - fragment.timestamp < RECENCY_WINDOW_MS
  );
  const score = (scoring.anchorId === entityId ? 5 : 0)
    + (scoring.focusEntities.includes(entityId) ? 3 : 0)
    + tagOverlap
    + (hasRecentLore ? 1 : 0);
  return {
    neighborIds: entity.links.map((link) => link.targetId),
    scored: { entity, score },
  };
};

const loadNeighbor = async (
  context: GraphContext,
  entityId: string
): Promise<ScoredEntity | null> => {
  const entity = await context.worldSchemaStore.getEntity({ id: entityId });
  return entity === null ? null : { entity, score: 1 };
};

const selectTopEntities = (entries: ScoredEntity[]): ScoredEntity[] => {
  const deduplicated = new Map<string, ScoredEntity>();
  for (const entry of entries) {
    const existing = deduplicated.get(entry.entity.id);
    if (existing === undefined || existing.score < entry.score) {
      deduplicated.set(entry.entity.id, entry);
    }
  }
  return Array.from(deduplicated.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, 7);
};

const buildSnippet = async (
  context: GraphContext,
  entry: ScoredEntity
): Promise<EntitySnippet> => {
  const fragments = await context.worldSchemaStore.listLoreFragmentsByEntity({
    entityId: entry.entity.id,
    limit: 1,
  });
  return {
    description: entry.entity.description,
    id: entry.entity.id,
    kind: entry.entity.kind,
    loreFragments: fragments.map((fragment) => ({
      slug: fragment.slug,
      summary: summarize(fragment.prose, 80),
      tags: fragment.tags,
      title: fragment.title,
    })),
    name: entry.entity.name,
    score: entry.score,
    slug: entry.entity.slug,
    status: entry.entity.status,
    subkind: entry.entity.subkind,
    tags: Array.from(new Set(fragments.flatMap((fragment) => fragment.tags))),
  };
};

export const buildEntityContext = async (context: GraphContext): Promise<EntityContextSlice> => {
  const anchorId = context.chronicleState.chronicle.anchorEntityId;
  const focusFromEntity = topEntities(context.chronicleState.chronicle.entityFocus, 3);
  const focusSet = new Set<string>();
  if (anchorId !== undefined) {
    focusSet.add(anchorId);
  }
  focusFromEntity.forEach((id) => focusSet.add(id));
  const focusEntities = Array.from(focusSet);
  const focusTags = topTags(context.chronicleState.chronicle.entityFocus, 5);
  const focusTagSet = new Set(focusTags);
  const scoring: FocusScoring = {
    anchorId,
    focusEntities,
    focusTags: focusTagSet,
    nowTs: Date.now(),
  };
  const focused = await Promise.all(focusEntities.map((entityId) =>
    loadFocusedEntity(context, entityId, scoring)
  ));
  const neighborIds = new Set(focused.flatMap((result) => result.neighborIds));
  const neighbors = await Promise.all(Array.from(neighborIds).map((entityId) =>
    loadNeighbor(context, entityId)
  ));
  const scored = [
    ...focused.map((result) => result.scored),
    ...neighbors,
  ].filter((entry): entry is ScoredEntity => entry !== null);
  const offered = await Promise.all(
    selectTopEntities(scored).map((entry) => buildSnippet(context, entry))
  );

  return {
    focusEntities,
    focusTags,
    offered,
  };
};
