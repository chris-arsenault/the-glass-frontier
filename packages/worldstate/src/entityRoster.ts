import type {
  ContextSliceEntity,
  EntityAvailability,
  EntityRosterEntry,
  EntityRosterState,
} from '@glass-frontier/dto';

import type { WorldSchemaStore } from './types';

const ENTITY_ROSTER_LIMIT = 7;
const ENTITY_ROSTER_CANDIDATE_LIMIT = 50;
const UNWRITTEN_ROSTER_LIMIT = 2;
const ROSTER_KINDS = new Set<ContextSliceEntity['kind']>([
  'artifact',
  'creature',
  'faction',
  'incident',
  'installation',
  'npc',
  'rumor',
  'transport',
]);
const ROSTER_LOCATION_SUBKINDS = new Set<ContextSliceEntity['subkind']>([
  'hazardous_zone',
  'region',
  'settlement',
]);
const ROSTER_RESOURCE_SUBKINDS = new Set<ContextSliceEntity['subkind']>([
  'device',
  'food',
  'infrastructure',
  'medicine',
]);

type EntityRosterContext = {
  anchorId?: string;
  locationId?: string;
  recentIds?: string[];
  sceneSubjectId?: string;
};

const rosterPriority = (
  entry: ContextSliceEntity,
  context: EntityRosterContext,
  recentIds: ReadonlySet<string>
): number => {
  if (recentIds.has(entry.id)) {
    return 4;
  }
  if (entry.id === context.sceneSubjectId) {
    return 3;
  }
  if (entry.id === context.anchorId) {
    return 2;
  }
  return entry.id === context.locationId ? 1 : 0;
};

/**
 * Whether an entity is concrete enough to offer as something play can address.
 * Broader canon remains in the context slice so free-text references can still
 * resolve it; this boundary only controls the proactive roster.
 */
export const isEntityRosterEligible = (
  entry: Pick<ContextSliceEntity, 'kind' | 'subkind'>
): boolean => {
  if (ROSTER_KINDS.has(entry.kind)) {
    return true;
  }
  if (entry.kind === 'geographic_location') {
    return ROSTER_LOCATION_SUBKINDS.has(entry.subkind);
  }
  return entry.kind === 'resource' && ROSTER_RESOURCE_SUBKINDS.has(entry.subkind);
};

/**
 * Removes article-like canon and orders the remaining candidates by direct
 * involvement before falling back to graph relevance. It may return fewer
 * than seven entries rather than filling the roster with weakly related lore.
 *
 * At most two seats go to unwritten shells. A roster of hooks leaves the GM
 * nothing to stay consistent with; a roster without any leaves play no new
 * ground to claim.
 */
export const curateEntityRoster = (
  entries: ContextSliceEntity[],
  context: EntityRosterContext
): ContextSliceEntity[] => {
  const recentIds = new Set(context.recentIds ?? []);
  const ranked = entries.filter(isEntityRosterEligible).sort((left, right) => {
    const priority = rosterPriority(right, context, recentIds)
      - rosterPriority(left, context, recentIds);
    return priority === 0 ? right.score - left.score : priority;
  });
  const roster: ContextSliceEntity[] = [];
  let unwrittenCount = 0;
  for (const entry of ranked) {
    if (roster.length >= ENTITY_ROSTER_LIMIT) {
      break;
    }
    if (entry.unwritten && unwrittenCount >= UNWRITTEN_ROSTER_LIMIT) {
      continue;
    }
    unwrittenCount += entry.unwritten ? 1 : 0;
    roster.push(entry);
  }
  return roster;
};

export const toEntityRosterEntries = (
  entries: ContextSliceEntity[],
  context: EntityRosterContext
): EntityRosterEntry[] => {
  const recentIds = new Set(context.recentIds ?? []);
  return entries.map((entry) => {
    const availability: EntityAvailability[] = [];
    if (entry.id === context.anchorId) {
      availability.push('anchor');
    }
    if (entry.id === context.locationId) {
      availability.push('location');
    }
    if (entry.id === context.sceneSubjectId) {
      availability.push('scene');
    }
    if (recentIds.has(entry.id)) {
      availability.push('recent');
    }
    if (availability.length === 0) {
      availability.push('connected');
    }
    return {
      availability,
      description: entry.description,
      id: entry.id,
      kind: entry.kind,
      name: entry.name,
      slug: entry.slug,
      status: entry.status,
      subkind: entry.subkind,
    };
  });
};

export const buildInitialEntityRoster = async (
  store: Pick<WorldSchemaStore, 'getContextSlice'>,
  input: {
    anchorId?: string;
    locationId: string;
    locationName: string;
  }
): Promise<EntityRosterState> => {
  const initialEntities = await store.getContextSlice({
    anchorId: input.anchorId,
    focusIds: [...new Set([input.locationId, input.anchorId].filter(
      (id): id is string => id !== undefined
    ))],
    focusTags: [],
    limit: ENTITY_ROSTER_CANDIDATE_LIMIT,
    loreLimit: 0,
    maxHops: 2,
    minProminence: 'marginal',
  });
  return {
    entries: toEntityRosterEntries(
      curateEntityRoster(initialEntities, {
        anchorId: input.anchorId,
        locationId: input.locationId,
      }),
      {
        anchorId: input.anchorId,
        locationId: input.locationId,
      }
    ),
    locationName: input.locationName,
    sceneId: null,
    updatedAtTurn: 0,
  };
};
