import type { ProposedEntity, ProposedRelationship } from '@glass-frontier/dto';

/** The entity props envelope: the fact card plus any authored spatial geometry. */
export const entityPropsJson = (proposed: ProposedEntity): string => {
  const { facts = {}, gmNotes, positions, routeGeometry } = proposed;
  return JSON.stringify({
    facts,
    ...(gmNotes !== undefined && gmNotes.length > 0 ? { gmNotes } : {}),
    ...(positions !== undefined && positions.length > 0 ? { positions } : {}),
    ...(routeGeometry === undefined ? {} : { routeGeometry }),
  });
};

/** The edge props envelope: typed relation properties beneath the temporal keys. */
export const relationshipPropsJson = (relationship: ProposedRelationship): string =>
  JSON.stringify({
    ...(relationship.props ?? {}),
    ...(relationship.live === undefined ? {} : { live: relationship.live }),
    ...(relationship.since === undefined ? {} : { since: relationship.since }),
    ...(relationship.until === undefined ? {} : { until: relationship.until }),
  });
