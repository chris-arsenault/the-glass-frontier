import { z } from 'zod';

import {
  RELATIONSHIP_TYPE_IDS,
  WORLD_KIND_IDS,
  WORLD_PROMINENCE_IDS,
  WORLD_SUBKIND_IDS,
} from './vocabulary';

/**
 * Every enumerated value set here is derived from the world vocabulary in
 * `vocabulary.ts`. Add a kind, subkind, or relationship verb there and it
 * becomes valid on the wire, in the database seed, and in the ingest validator
 * at once. Status is deliberately free text: the source schema declares no
 * status vocabulary, so the game does not invent one.
 */

export const HardStateKind = z.enum(WORLD_KIND_IDS);
export type HardStateKind = z.infer<typeof HardStateKind>;

export const HardStateSubkind = z.enum(WORLD_SUBKIND_IDS);
export type HardStateSubkind = z.infer<typeof HardStateSubkind>;

export const HardStateStatus = z.string().min(1);
export type HardStateStatus = z.infer<typeof HardStateStatus>;

export const HardStateProminence = z.enum(WORLD_PROMINENCE_IDS);
export type HardStateProminence = z.infer<typeof HardStateProminence>;

export const PLAYABLE_ROLE_IDS = [
  'species',
  'culture',
  'homeland',
  'allegiance',
  'chronicle_location',
] as const;
export const PlayableRole = z.enum(PLAYABLE_ROLE_IDS);
export type PlayableRole = z.infer<typeof PlayableRole>;

export const RelationshipType = z.enum(RELATIONSHIP_TYPE_IDS);
export type RelationshipType = z.infer<typeof RelationshipType>;

/**
 * The small, repeated answers a reader expects at the top of an entry —
 * "Born", "Population", "Function". Keys and values come from the source
 * world's fact cards; the game stores them verbatim.
 */
export const HardStateFacts = z.record(z.string(), z.union([z.string(), z.number()]));
export type HardStateFacts = z.infer<typeof HardStateFacts>;

export const GM_NOTE_KIND_IDS = ['appears', 'triggered_by', 'complicates'] as const;
export const GmNoteKind = z.enum(GM_NOTE_KIND_IDS);
export type GmNoteKind = z.infer<typeof GmNoteKind>;

/**
 * One instruction for running an entity, published with its lore. The kind says
 * when it applies: `appears` when the entity enters a scene nobody asked for,
 * `triggered_by` when the players said or did the thing it names, and
 * `complicates` once it is already present.
 */
export const GmNote = z.object({
  kind: GmNoteKind,
  text: z.string().min(1).max(320),
});
export type GmNote = z.infer<typeof GmNote>;

/**
 * Coordinates within a spatial frame, stored verbatim from the source: a
 * polar position uses `radius`/`angle_deg` (or `radial_offset`/
 * `angle_offset_deg` when relative), a surface position uses `latitude_deg`/
 * `longitude_deg` with an optional `extent_radius_km` or `size_class`.
 */
export const SpatialCoordinates = z.record(z.string(), z.union([z.string(), z.number()]));
export type SpatialCoordinates = z.infer<typeof SpatialCoordinates>;

/**
 * An authored position from the source's fixed spatial geometry. Frames and
 * reference entities are named by their source slugs; the Atlas resolves them
 * against the entities it already has rather than by id.
 */
export const SpatialPosition = z.object({
  coordinates: SpatialCoordinates,
  frameId: z.string().min(1),
  /** Source slug of the entity this position is measured from, if relative. */
  relativeToId: z.string().min(1).optional(),
});
export type SpatialPosition = z.infer<typeof SpatialPosition>;

export const RouteGeometryPoint = z.object({
  /** Local coordinates in the route's frame, for points that are not entities. */
  coordinates: SpatialCoordinates.optional(),
  /** Source slug of the anchored entity, whose own position places the point. */
  entityId: z.string().min(1).optional(),
  id: z.string().min(1),
  kind: z.enum(['anchor', 'point']),
});
export type RouteGeometryPoint = z.infer<typeof RouteGeometryPoint>;

export const RouteGeometryPath = z.object({
  id: z.string().min(1),
  through: z.array(z.string().min(1)).min(2),
});
export type RouteGeometryPath = z.infer<typeof RouteGeometryPath>;

/** The authored shape of a route: named points and the paths through them. */
export const RouteGeometry = z.object({
  frameId: z.string().min(1),
  paths: z.array(RouteGeometryPath).default([]),
  points: z.array(RouteGeometryPoint).default([]),
});
export type RouteGeometry = z.infer<typeof RouteGeometry>;

/**
 * The resolved descriptive-identity snapshot: stable identity keys to composed
 * text, inherited from source entries and finished by local operations.
 */
export const DescriptiveIdentity = z.record(z.string(), z.string().min(1));
export type DescriptiveIdentity = z.infer<typeof DescriptiveIdentity>;

/** One identity source-slot assignment, referencing the source entry by external key. */
export const IdentitySourceAssignment = z.object({
  /** The source relation verb, present when the slot derives from a live relation. */
  relation: z.string().min(1).optional(),
  slot: z.string().min(1),
  sourceExternalKey: z.string().min(1),
  /** How the source was selected: an authored reference or a live relation. */
  via: z.enum(['direct', 'relation']),
});
export type IdentitySourceAssignment = z.infer<typeof IdentitySourceAssignment>;

/** An authored local identity operation on one key. */
export const IdentityLocalValue = z.object({
  operation: z.enum(['extend', 'override']),
  text: z.string().min(1),
});
export type IdentityLocalValue = z.infer<typeof IdentityLocalValue>;

/** The authored local dictionary only — inherited prose is never stamped here. */
export const IdentityLocal = z.record(z.string(), IdentityLocalValue);
export type IdentityLocal = z.infer<typeof IdentityLocal>;

/** One provenance row: where a piece of resolved identity text came from. */
export const IdentityContribution = z.object({
  key: z.string().min(1),
  operation: z.enum(['extend', 'override', 'replace']),
  /** Absent on local operations; the owner itself supplied the text. */
  sourceExternalKey: z.string().min(1).optional(),
  /** The key on the source entry the text was projected from. */
  sourceKey: z.string().min(1).optional(),
  sourceSlot: z.string().min(1).optional(),
  suppressed: z.boolean(),
  text: z.string().min(1),
});
export type IdentityContribution = z.infer<typeof IdentityContribution>;

export const IdentityProvenance = z.record(z.string(), z.array(IdentityContribution));
export type IdentityProvenance = z.infer<typeof IdentityProvenance>;

/** Typed relation properties declared by the source schema (bearings, frames…). */
export const HardStateLinkProps = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()])
);
export type HardStateLinkProps = z.infer<typeof HardStateLinkProps>;

export const HardStateLink = z.object({
  /** The relationship's resolved descriptive identity, when the source declares one. */
  descriptiveIdentity: DescriptiveIdentity.optional(),
  direction: z.enum(['out', 'in']),
  identityLocal: IdentityLocal.optional(),
  identityProvenance: IdentityProvenance.optional(),
  identitySources: z.array(IdentitySourceAssignment).optional(),
  /** Whether the relationship is active in the source canon's present. */
  live: z.boolean().default(true),
  /** Typed relation properties, e.g. adjacency bearing and frame. */
  props: HardStateLinkProps.optional(),
  relationship: RelationshipType,
  /** In-world year the relation began, when the source records one. */
  since: z.number().int().optional(),
  strength: z.number().min(0).max(1).optional(), // 0.0 (weak/spatial) to 1.0 (strong/narrative)
  targetId: z.string().min(1),
  /** In-world year the relation ended, when the source records one. */
  until: z.number().int().optional(),
});
export type HardStateLink = z.infer<typeof HardStateLink>;

/**
 * One live canonical relationship among a selected entity set — the batched
 * relationship read model for scene context: canonical endpoints, verb,
 * interval, typed props, and the edge's descriptive identity.
 */
export const LiveRelationship = z.object({
  descriptiveIdentity: DescriptiveIdentity.optional(),
  dstId: z.string().min(1),
  identityLocal: IdentityLocal.optional(),
  identityProvenance: IdentityProvenance.optional(),
  identitySources: z.array(IdentitySourceAssignment).optional(),
  props: HardStateLinkProps.optional(),
  relationship: RelationshipType,
  since: z.number().int().optional(),
  srcId: z.string().min(1),
  strength: z.number().min(0).max(1).optional(),
  until: z.number().int().optional(),
});
export type LiveRelationship = z.infer<typeof LiveRelationship>;

export const HardState = z.object({
  createdAt: z
    .number()
    .int()
    .nonnegative()
    .default(() => Date.now()),
  description: z.string().max(2000).optional(),
  /** The resolved descriptive-identity snapshot from the source canon. */
  descriptiveIdentity: DescriptiveIdentity.optional(),
  /** Hidden canon that player-facing Atlas surfaces must not expose. */
  dm: z.boolean().default(false),
  /** Stable identity from the source world, e.g. `tsonu:kaleidos`. */
  externalKey: z.string().min(1).optional(),
  facts: HardStateFacts.default({}),
  /**
   * How to run this entity. Stored in the props envelope and, until now, only
   * ever surfaced by the context slice — so every reader that went through
   * `getEntity` silently had none, including the chronicle opening.
   */
  gmNotes: z.array(GmNote).optional(),
  id: z.string().min(1),
  /** Authored local identity operations; inherited prose is never stamped here. */
  identityLocal: IdentityLocal.optional(),
  /** Per-key provenance of the resolved identity, including suppressed rows. */
  identityProvenance: IdentityProvenance.optional(),
  /** Identity source-slot assignments — the preserved inheritance graph. */
  identitySources: z.array(IdentitySourceAssignment).default([]),
  /** A reference page rather than an entity in the game-world graph. */
  isArticle: z.boolean().default(false),
  /**
   * Whether this entity is a place a scene can be set — the game-layer
   * "location" concept. Defaulted from the kind at ingest and overridable per
   * entity, so a named ship or a vast creature can be somewhere to be.
   */
  isLocation: z.boolean().default(false),
  kind: HardStateKind,
  links: z.array(HardStateLink).default([]),
  name: z.string().min(1),
  originBlurb: z.string().max(140).optional(),
  playableAs: z.array(PlayableRole).default([]),
  /** Authored positions from the source's fixed spatial geometry. */
  positions: z.array(SpatialPosition).default([]),
  prominence: HardStateProminence.default('recognized'),
  /** Authored route shape, present only on route entities like trade lanes. */
  routeGeometry: RouteGeometry.optional(),
  slug: z.string().min(1),
  status: HardStateStatus.optional(),
  subkind: HardStateSubkind.optional(),
  updatedAt: z
    .number()
    .int()
    .nonnegative()
    .default(() => Date.now()),
  veiled: z.boolean().default(false),
  veilTagline: z.string().max(180).optional(),
});

export type HardState = z.infer<typeof HardState>;
