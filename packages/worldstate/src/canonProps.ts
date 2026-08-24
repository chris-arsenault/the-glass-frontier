import type {
  DescriptiveIdentity,
  GmNote,
  IdentityLocal,
  IdentityProvenance,
  IdentitySourceAssignment,
  ProposedEntity,
  ProposedRelationship,
  RouteGeometry,
  SpatialPosition,
} from '@glass-frontier/dto';

/** The stored entity props envelope, as written at ingest and read back by readers. */
export type EntityPropsEnvelope = {
  descriptiveIdentity?: DescriptiveIdentity;
  facts?: Record<string, string | number>;
  gmNotes?: GmNote[];
  identityLocal?: IdentityLocal;
  identityProvenance?: IdentityProvenance;
  identitySources?: IdentitySourceAssignment[];
  positions?: SpatialPosition[];
  routeGeometry?: RouteGeometry;
};

/** The stored edge props envelope beneath the relation's typed properties. */
export type EdgePropsEnvelope = {
  descriptiveIdentity?: DescriptiveIdentity;
  identityLocal?: IdentityLocal;
  identityProvenance?: IdentityProvenance;
  identitySources?: IdentitySourceAssignment[];
  live?: boolean;
  since?: number;
  until?: number;
};

const nonEmpty = <Value>(values: Value[] | undefined): Value[] | undefined =>
  values !== undefined && values.length > 0 ? values : undefined;

/**
 * The entity props envelope: the fact card, any authored spatial geometry, and
 * the descriptive-identity data — the resolved snapshot as the read model, and
 * the source-slot assignments, local operations, and provenance as the
 * preserved inheritance graph. JSON.stringify drops the undefined members.
 */
export const entityPropsJson = (proposed: ProposedEntity): string =>
  JSON.stringify({
    facts: proposed.facts ?? {},
    ...{
      descriptiveIdentity: proposed.descriptiveIdentity,
      gmNotes: nonEmpty(proposed.gmNotes),
      identityLocal: proposed.identityLocal,
      identityProvenance: proposed.identityProvenance,
      identitySources: nonEmpty(proposed.identitySources),
      positions: nonEmpty(proposed.positions),
      routeGeometry: proposed.routeGeometry,
    },
  });

/**
 * The edge props envelope: typed relation properties beneath the temporal keys
 * and the relationship's descriptive-identity data.
 */
export const relationshipPropsJson = (relationship: ProposedRelationship): string =>
  JSON.stringify({
    ...(relationship.props ?? {}),
    ...{
      descriptiveIdentity: relationship.descriptiveIdentity,
      identityLocal: relationship.identityLocal,
      identityProvenance: relationship.identityProvenance,
      identitySources: nonEmpty(relationship.identitySources),
      live: relationship.live,
      since: relationship.since,
      until: relationship.until,
    },
  });
