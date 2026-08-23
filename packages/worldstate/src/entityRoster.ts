import type {
  ContextSliceEntity,
  EntityAvailability,
  EntityRosterEntry,
  EntityRosterState,
} from '@glass-frontier/dto';

import type { WorldSchemaStore } from './types';

export const toEntityRosterEntries = (
  entries: ContextSliceEntity[],
  context: {
    anchorId?: string;
    locationId?: string;
    recentIds?: string[];
    sceneSubjectId?: string;
  }
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
    limit: 7,
    loreLimit: 0,
    maxHops: 2,
    minProminence: 'marginal',
  });
  return {
    entries: toEntityRosterEntries(initialEntities, {
      anchorId: input.anchorId,
      locationId: input.locationId,
    }),
    locationName: input.locationName,
    sceneId: null,
    updatedAtTurn: 0,
  };
};
