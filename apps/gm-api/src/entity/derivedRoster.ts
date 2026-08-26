import type { EntityAvailability, EntityRosterEntry, HardState } from '@glass-frontier/dto';

import type { GraphContext } from '../types';

const ROSTER_LIMIT = 12;

/**
 * The roster after the turn, derived from what the turn actually used.
 *
 * It used to be chosen before the turn by a scorer walking two hops out from
 * the anchor, and it doubled as the GM's permitted knowledge — which is how a
 * chronicle ended up carrying a pilgrim bead and a Tuner guild for its whole
 * run. Retrieval decides what the GM knows now, so the roster is only what it
 * still is to the player: a record of who is in play. It reads the entities
 * the narration used, the scene's subject, the anchor, and the location, in
 * that order of claim. The persisted shape is unchanged — the client panel,
 * targeting chips, and the closer all still read it.
 */
export const withDerivedRoster = async (context: GraphContext): Promise<GraphContext> => {
  if (context.failure) {
    return context;
  }
  const entries = await deriveRoster(context);
  return {
    ...context,
    chronicleState: {
      ...context.chronicleState,
      chronicle: {
        ...context.chronicleState.chronicle,
        entityRoster: {
          entries,
          locationName: context.chronicleState.locationName,
          sceneId: context.chronicleState.chronicle.activeScene?.id ?? null,
          updatedAtTurn: context.turnSequence,
        },
      },
    },
    turnEntityRoster: entries,
  };
};

const deriveRoster = async (context: GraphContext): Promise<EntityRosterEntry[]> => {
  const anchorId = context.chronicleState.chronicle.anchorEntityId;
  const sceneSubjectId = context.chronicleState.chronicle.activeScene?.subjectEntityId;
  const location = await context.worldSchemaStore.findLocationByName({
    name: context.chronicleState.locationName,
  });
  const usedIds = (context.entityUsage ?? []).map((entry) => entry.entityId);
  const ids = [...new Set([
    ...usedIds,
    ...sceneSubjectId === undefined ? [] : [sceneSubjectId],
    ...anchorId === undefined || anchorId === null ? [] : [anchorId],
    ...location === null ? [] : [location.id],
  ])].slice(0, ROSTER_LIMIT);
  if (ids.length === 0) {
    return context.chronicleState.chronicle.entityRoster.entries;
  }
  const entities = await context.worldSchemaStore.listEntitiesByIds(ids);
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  return ids.flatMap((id) => {
    const entity = byId.get(id);
    return entity === undefined || entity.dm ? [] : [rosterEntry(entity, {
      anchorId: anchorId ?? null,
      locationId: location?.id ?? null,
      sceneSubjectId: sceneSubjectId ?? null,
      used: usedIds.includes(id),
    })];
  });
};

const rosterEntry = (
  entity: HardState,
  claim: {
    anchorId: string | null;
    locationId: string | null;
    sceneSubjectId: string | null;
    used: boolean;
  }
): EntityRosterEntry => {
  const availability: EntityAvailability[] = [];
  if (entity.id === claim.anchorId) {
    availability.push('anchor');
  }
  if (entity.id === claim.locationId) {
    availability.push('location');
  }
  if (entity.id === claim.sceneSubjectId) {
    availability.push('scene');
  }
  if (claim.used) {
    availability.push('recent');
  }
  if (availability.length === 0) {
    availability.push('connected');
  }
  return {
    availability,
    description: entity.description,
    id: entity.id,
    kind: entity.kind,
    name: entity.name,
    slug: entity.slug,
    status: entity.status,
    subkind: entity.subkind,
  };
};
