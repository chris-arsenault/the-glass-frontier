import type { GraphContext, EntityContextSlice, EntityFocusState } from '../types';

const FOCUS_ENTITY_COUNT = 3;
const FOCUS_TAG_COUNT = 5;
const OFFERED_COUNT = 7;

const topScored = (scores: Record<string, number> | undefined, count: number): string[] =>
  Object.entries(scores ?? {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, count)
    .map(([key]) => key);

const topTags = (focus: EntityFocusState | null | undefined, count: number): string[] =>
  topScored(focus?.tagScores, count);

const topEntities = (focus: EntityFocusState | null | undefined, count: number): string[] =>
  topScored(focus?.entityScores, count);

/**
 * Chooses what the GM should know about the world this turn.
 *
 * The anchor and the entities recent turns leaned on are the focus set; the
 * store walks outward from them along strength-weighted relationships and
 * returns the ranked result with lore attached, in one query. Selection policy
 * lives here; traversal and scoring live in the store.
 */
export const buildEntityContext = async (context: GraphContext): Promise<EntityContextSlice> => {
  const { anchorEntityId, entityFocus } = context.chronicleState.chronicle;
  const focusEntities = [
    ...new Set([
      ...(anchorEntityId === undefined ? [] : [anchorEntityId]),
      ...topEntities(entityFocus, FOCUS_ENTITY_COUNT),
    ]),
  ];
  const focusTags = topTags(entityFocus, FOCUS_TAG_COUNT);

  if (focusEntities.length === 0) {
    return { focusEntities, focusTags, offered: [] };
  }

  const slice = await context.worldSchemaStore.getContextSlice({
    anchorId: anchorEntityId,
    focusIds: focusEntities,
    focusTags,
    limit: OFFERED_COUNT,
    loreLimit: 2,
    maxHops: 2,
    minProminence: 'recognized',
  });

  return {
    focusEntities,
    focusTags,
    offered: slice.map((entry) => ({
      description: entry.description,
      id: entry.id,
      kind: entry.kind,
      loreFragments: entry.lore,
      name: entry.name,
      score: entry.score,
      slug: entry.slug,
      status: entry.status,
      subkind: entry.subkind,
      tags: entry.tags,
    })),
  };
};
