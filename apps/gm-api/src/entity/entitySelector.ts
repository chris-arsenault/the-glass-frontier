import type { ContextSliceEntity, EntityRosterState } from '@glass-frontier/dto';
import {
  curateEntityRoster,
  isEntityRosterEligible,
  toEntityRosterEntries,
} from '@glass-frontier/worldstate';

import type { GraphContext, EntityContextSlice, EntityFocusState, EntitySnippet } from '../types';

const FOCUS_ENTITY_COUNT = 3;
const FOCUS_TAG_COUNT = 5;
const CANDIDATE_COUNT = 50;
const ROSTER_COUNT = 7;

const topScored = (scores: Record<string, number> | undefined, count: number): string[] =>
  Object.entries(scores ?? {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, count)
    .map(([key]) => key);

const topTags = (focus: EntityFocusState | null | undefined, count: number): string[] =>
  topScored(focus?.tagScores, count);

const topEntities = (focus: EntityFocusState | null | undefined, count: number): string[] =>
  topScored(focus?.entityScores, count);

const toCandidate = (entry: ContextSliceEntity): EntitySnippet => ({
  description: entry.description,
  facts: entry.facts,
  gmNotes: entry.gmNotes,
  id: entry.id,
  kind: entry.kind,
  loreFragments: entry.lore,
  name: entry.name,
  score: entry.score,
  slug: entry.slug,
  status: entry.status,
  subkind: entry.subkind,
  tags: entry.tags,
  unwritten: entry.unwritten,
});

const buildFocusEntities = (
  context: GraphContext,
  locationId: null | string
): string[] => {
  const { anchorEntityId, entityFocus } = context.chronicleState.chronicle;
  return [...new Set([
    anchorEntityId,
    locationId,
    context.effectiveScene?.subjectEntityId,
    ...topEntities(entityFocus, FOCUS_ENTITY_COUNT),
  ].filter((id): id is string => id !== null && id !== undefined))];
};

const rosterNeedsRefresh = (
  context: GraphContext,
  entityRoster: EntityRosterState
): boolean => entityRoster.entries.length === 0
  || entityRoster.entries.some((entry) => !isEntityRosterEligible(entry))
  || entityRoster.locationName !== context.chronicleState.locationName
  || entityRoster.sceneId !== (context.effectiveScene?.id ?? null);

type RosterSelectionInput = {
  candidates: EntitySnippet[];
  curatedRoster: ContextSliceEntity[];
  entityRoster: EntityRosterState;
  refresh: boolean;
  targetEntityIds: string[];
};

/** Entities the player targeted lead the roster, cap or no cap. */
const selectRosterIds = ({
  candidates,
  curatedRoster,
  entityRoster,
  refresh,
  targetEntityIds,
}: RosterSelectionInput): string[] => {
  const selectedIds = refresh
    ? curatedRoster.map((entry) => entry.id)
    : entityRoster.entries.map((entry) => entry.id);
  for (const targetId of targetEntityIds) {
    if (candidates.some((entry) => entry.id === targetId) && !selectedIds.includes(targetId)) {
      selectedIds.unshift(targetId);
    }
  }
  return selectedIds.slice(0, ROSTER_COUNT);
};

const rosterContext = (
  context: GraphContext,
  locationId: string | undefined
): Parameters<typeof curateEntityRoster>[1] => {
  const { anchorEntityId, entityFocus } = context.chronicleState.chronicle;
  return {
    anchorId: anchorEntityId,
    locationId,
    recentIds: topEntities(entityFocus, FOCUS_ENTITY_COUNT),
    sceneSubjectId: context.effectiveScene?.subjectEntityId,
  };
};

const selectSliceEntries = (
  slice: ContextSliceEntity[],
  rosterIds: string[]
): ContextSliceEntity[] => {
  const byId = new Map(slice.map((entry) => [entry.id, entry]));
  return rosterIds
    .map((id) => byId.get(id))
    .filter((entry): entry is ContextSliceEntity => entry !== undefined);
};

/**
 * Chooses what the GM should know about the world this turn.
 *
 * The anchor, the entities recent turns leaned on, and — when the scene's
 * current name matches a canon place — the location itself form the focus set;
 * the store walks outward from them along strength-weighted relationships and
 * returns the ranked result with lore attached, in one query. Selection policy
 * lives here; traversal and scoring live in the store.
 *
 * The prominence floor sits at `marginal`: local color (interiors, residents,
 * creatures) is exactly what a scene needs, and scoring already lets renown
 * break ties. Only `forgotten` entities stay out of reach.
 */
export const buildEntityContext = async (context: GraphContext): Promise<EntityContextSlice> => {
  const { anchorEntityId, entityFocus } = context.chronicleState.chronicle;
  const entityRoster = context.chronicleState.chronicle.entityRoster;
  const currentLocation = await context.worldSchemaStore.findLocationByName({
    name: context.chronicleState.locationName,
  });
  const focusEntities = buildFocusEntities(context, currentLocation?.id ?? null);
  const focusTags = topTags(entityFocus, FOCUS_TAG_COUNT);

  if (focusEntities.length === 0) {
    return { candidates: [], focusEntities, focusTags, offered: [], roster: [] };
  }

  const slice = await context.worldSchemaStore.getContextSlice({
    anchorId: context.effectiveScene?.subjectEntityId ?? anchorEntityId,
    focusIds: focusEntities,
    focusTags,
    limit: CANDIDATE_COUNT,
    loreLimit: 2,
    maxHops: 2,
    minProminence: 'marginal',
  });

  const candidates = slice.map(toCandidate);
  const selectionContext = rosterContext(context, currentLocation?.id);
  const curatedRoster = curateEntityRoster(slice, selectionContext);
  const rosterIds = selectRosterIds({
    candidates,
    curatedRoster,
    entityRoster,
    refresh: rosterNeedsRefresh(context, entityRoster),
    targetEntityIds: context.targetEntityIds,
  });
  const selectedSlice = selectSliceEntries(slice, rosterIds);
  const roster = toEntityRosterEntries(selectedSlice, selectionContext);
  const offered = roster.flatMap((entry) => {
    const candidate = candidates.find((item) => item.id === entry.id);
    return candidate === undefined ? [] : [candidate];
  });

  return {
    candidates,
    focusEntities,
    focusTags,
    offered,
    roster,
  };
};
