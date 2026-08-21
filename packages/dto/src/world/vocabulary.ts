/**
 * The world vocabulary: the single canonical source for entity kinds, subkinds,
 * relationship verbs, tags, and prominence tiers.
 *
 * This artifact is **derived from tsonu-canon**, the lore's source of truth:
 * `craft/schema/base.rb` declares the entity kinds, subkinds, and the shared
 * relation taxonomy, and `worlds/glass-frontier/world/schema.rb` adds the
 * setting-specific parts (resonance relations, the DM edges, the tag
 * vocabulary). Keep the two in sync — changing the world's shape means editing
 * the source schema first and mirroring it here.
 *
 * Deliberate differences from the source:
 * - The source's structural kinds (`loop`, `theme`, `thread`) and wiki
 *   bookkeeping relations (`embeds`, `mentions`, `extends`, `at_stage`,
 *   `fills_beat`, `has_beat`, `has_stage`, `has_archetype`) stay in the
 *   authoring engine; the game graph carries the world atlas only.
 * - `defaultStrength` is retrieval policy, not canon: it is the prior used to
 *   weight graph traversal when an edge carries no explicit strength.
 * - Entity statuses are free text. The source schema declares none (its
 *   `status` field is authoring workflow), so the game does not invent an
 *   enumeration.
 */

export type WorldKindDefinition = {
  id: WorldKindId;
  displayName: string;
  subkinds: readonly WorldSubkindId[];
};

/** Relation categories, as declared by the source schema. */
export type RelationshipCategory =
  | 'causal'
  | 'spatial'
  | 'organizational'
  | 'social'
  | 'technical'
  | 'narrative'
  | 'dm'
  | 'banned';

export type RelationshipTypeDefinition = {
  id: RelationshipTypeId;
  description: string;
  category: RelationshipCategory;
  /**
   * Prior used when an edge carries no explicit strength.
   * 0.0 is incidental or purely spatial, 1.0 is defining and narrative.
   * Traversal weights paths by COALESCE(edge.strength, defaultStrength).
   */
  defaultStrength: number;
  /**
   * Kind constraint, only where the source schema declares one
   * (`fought_over` is conflict → resource). Unconstrained relations accept
   * any pair, matching the source's validation.
   */
  constraint?: { srcKind: WorldKindId; dstKind: WorldKindId };
};

export type ProminenceDefinition = {
  id: ProminenceId;
  rank: number;
};

export type WorldTagDefinition = {
  id: string;
  description: string;
};

const PROMINENCE_DEFS = [
  { id: 'forgotten', rank: 0 },
  { id: 'marginal', rank: 1 },
  { id: 'recognized', rank: 2 },
  { id: 'renowned', rank: 3 },
  { id: 'mythic', rank: 4 },
] as const;

/**
 * The atlas kinds, verbatim from `entity_type` in the source base schema.
 * Subkind lists merge the base `extend_kind` blocks with the world's
 * `extend_subkind` additions.
 */
const KIND_DEFS = [
  {
    displayName: 'Ability',
    id: 'ability',
    subkinds: ['learned_ability', 'innate_ability'],
  },
  {
    displayName: 'Artifact',
    id: 'artifact',
    subkinds: ['instrument', 'record', 'relic', 'machine'],
  },
  {
    displayName: 'Concept',
    id: 'concept',
    subkinds: [
      'doctrine', 'practice', 'technology', 'physical_system', 'social_system',
      'reference_concept',
    ],
  },
  {
    displayName: 'Conflict',
    id: 'conflict',
    subkinds: ['war', 'campaign', 'dispute'],
  },
  {
    displayName: 'Creature',
    id: 'creature',
    subkinds: ['animal', 'anomaly'],
  },
  {
    displayName: 'Culture',
    id: 'culture',
    subkinds: ['overview', 'regional_culture', 'way_of_life', 'naming_practice'],
  },
  {
    displayName: 'Edict',
    id: 'edict',
    subkinds: [],
  },
  {
    displayName: 'Era',
    id: 'era',
    subkinds: ['historical_period'],
  },
  {
    displayName: 'Faction',
    id: 'faction',
    subkinds: [
      'government', 'governing_intelligence', 'company', 'civic_body',
      'resistance_network', 'community', 'trade_network', 'religious_order',
      'research_body', 'mutual_aid',
    ],
  },
  {
    displayName: 'Geographic Location',
    id: 'geographic_location',
    subkinds: [
      'star_system', 'celestial_body', 'orbit', 'world_region', 'region',
      'settlement', 'frontier', 'hazardous_zone',
    ],
  },
  {
    displayName: 'Incident',
    id: 'incident',
    subkinds: [
      'disaster', 'campaign', 'policy_action', 'operational_failure', 'dispute',
      'discovery', 'founding', 'migration',
    ],
  },
  {
    displayName: 'Installation',
    id: 'installation',
    subkinds: [
      'settlement', 'station', 'workshop', 'infrastructure', 'archive', 'clinic',
      'warehouse', 'landmark', 'border_post',
    ],
  },
  {
    displayName: 'NPC',
    id: 'npc',
    subkinds: ['official', 'specialist', 'worker', 'leader', 'courier', 'dissident'],
  },
  {
    displayName: 'Phenomenon',
    id: 'phenomenon',
    subkinds: [
      'physical_phenomenon', 'ecological_phenomenon', 'social_condition',
      'catastrophe',
    ],
  },
  {
    displayName: 'Resource',
    id: 'resource',
    subkinds: [
      'material', 'biological_material', 'device', 'medicine', 'food', 'data',
      'infrastructure',
    ],
  },
  {
    displayName: 'Rumor',
    id: 'rumor',
    subkinds: [],
  },
  {
    displayName: 'Species',
    id: 'species',
    subkinds: ['sapient_species', 'overview'],
  },
  {
    displayName: 'Transport',
    id: 'transport',
    subkinds: ['vessel'],
  },
] as const;

/**
 * The kinds that hold a place a scene can be set in. The source schema splits
 * "somewhere" into natural geography and built installations.
 */
export const LOCATION_KINDS = ['geographic_location', 'installation'] as const;

/**
 * The relation taxonomy, verbatim from the source base schema plus the
 * glass-frontier world's additions (`attuned_to`, `resonates_with`, and the
 * DM-only edges). Categories are the source's; strengths are retrieval priors.
 */
const RELATIONSHIP_TYPE_DEFS = [
  // Causal — what brought what about.
  { category: 'causal', defaultStrength: 0.3, description: 'Subject was active during the target era or conflict.', id: 'active_during' },
  { category: 'causal', defaultStrength: 0.7, description: 'Subject brought the target about.', id: 'caused' },
  { category: 'causal', defaultStrength: 0.7, description: 'Subject was brought about by the target.', id: 'caused_by' },
  { category: 'causal', defaultStrength: 0.7, description: 'Subject actively produces the target condition.', id: 'causes' },
  { category: 'causal', defaultStrength: 0.7, description: 'Subject made the target.', id: 'created' },
  { category: 'causal', defaultStrength: 0.3, description: 'Subject came into being during the target era or event.', id: 'created_during' },
  { category: 'causal', defaultStrength: 0.7, description: 'Subject destroyed the target.', id: 'destroyed' },
  { category: 'causal', defaultStrength: 0.3, description: 'Subject vanished during the target era or event.', id: 'disappeared_during' },
  { category: 'causal', defaultStrength: 0.3, description: 'Subject emerged during the target era or event.', id: 'emerged_during' },
  { category: 'causal', constraint: { dstKind: 'resource', srcKind: 'conflict' }, defaultStrength: 0.7, description: 'The conflict was fought over the target resource.', id: 'fought_over' },
  { category: 'causal', defaultStrength: 0.5, description: 'Subject originated in the target place or era.', id: 'originated_in' },
  { category: 'causal', defaultStrength: 0.6, description: 'Subject took part in the target incident or conflict.', id: 'participated_in' },

  // Spatial — where things sit relative to one another.
  { category: 'spatial', defaultStrength: 0.4, description: 'Subject was founded in the target place.', id: 'founded_in' },
  { category: 'spatial', defaultStrength: 0.6, description: 'Subject is headquartered in the target place.', id: 'headquartered_in' },
  { category: 'spatial', defaultStrength: 0.4, description: 'Subject place hosts the target.', id: 'hosts' },
  { category: 'spatial', defaultStrength: 0.3, description: 'Subject lies inward of the target.', id: 'inner_of' },
  { category: 'spatial', defaultStrength: 0.3, description: 'Subject sits in orbit of the target body.', id: 'in_orbit_of' },
  { category: 'spatial', defaultStrength: 0.5, description: 'Subject is located in the target place.', id: 'located_in' },
  { category: 'spatial', defaultStrength: 0.4, description: 'Subject manifests or is present at the target place.', id: 'manifests_at' },
  { category: 'spatial', defaultStrength: 0.3, description: 'Subject sits on the surface of the target body.', id: 'on_surface_of' },
  { category: 'spatial', defaultStrength: 0.5, description: 'Subject operates in the target place or region.', id: 'operates_in' },
  { category: 'spatial', defaultStrength: 0.3, description: 'Subject orbits the target body.', id: 'orbits' },
  { category: 'spatial', defaultStrength: 0.5, description: 'Subject is a part of the target.', id: 'part_of' },
  { category: 'spatial', defaultStrength: 0.4, description: 'Subject place is an endpoint of the target route.', id: 'terminus_of' },

  // Organizational — authority, membership, ownership.
  { category: 'organizational', defaultStrength: 0.8, description: 'Subject chairs the target body.', id: 'chairs' },
  { category: 'organizational', defaultStrength: 0.6, description: 'Subject is employed by the target.', id: 'employed_by' },
  { category: 'organizational', defaultStrength: 0.7, description: 'Subject is governed by the target.', id: 'governed_by' },
  { category: 'organizational', defaultStrength: 0.7, description: 'Subject governs the target.', id: 'governs' },
  { category: 'organizational', defaultStrength: 0.9, description: 'Subject leads the target.', id: 'leads' },
  { category: 'organizational', defaultStrength: 0.7, description: 'Subject is a member of the target.', id: 'member_of' },
  { category: 'organizational', defaultStrength: 0.6, description: 'Subject is owned by the target.', id: 'owned_by' },
  { category: 'organizational', defaultStrength: 0.5, description: 'Subject regulates the target.', id: 'regulates' },
  { category: 'organizational', defaultStrength: 0.5, description: 'Subject succeeded the target.', id: 'succeeded' },
  { category: 'organizational', defaultStrength: 0.5, description: 'Subject supplies the target.', id: 'supplies' },
  { category: 'organizational', defaultStrength: 0.5, description: 'Subject trains the target.', id: 'trains' },

  // Social — people and what they do with each other.
  { category: 'social', defaultStrength: 0.4, description: 'Subject was born in the target place.', id: 'born_in' },
  { category: 'social', defaultStrength: 0.4, description: 'Subject carries the target.', id: 'carries' },
  { category: 'social', defaultStrength: 0.4, description: 'Subject commemorates the target.', id: 'commemorates' },
  { category: 'social', defaultStrength: 0.6, description: 'Subject cooperates with the target.', id: 'cooperates_with' },
  { category: 'social', defaultStrength: 0.6, description: 'Subject inhabits the target place.', id: 'inhabits' },
  { category: 'social', defaultStrength: 0.5, description: 'Subject maintains the target.', id: 'maintains' },
  { category: 'social', defaultStrength: 0.6, description: 'Subject possesses the target.', id: 'possesses' },
  { category: 'social', defaultStrength: 0.6, description: 'Subject practice is practiced by the target.', id: 'practiced_by' },
  { category: 'social', defaultStrength: 0.5, description: 'Subject studies the target.', id: 'studies' },
  { category: 'social', defaultStrength: 0.5, description: 'Subject taught the target.', id: 'taught' },

  // Technical — how made things depend on each other.
  { category: 'technical', defaultStrength: 0.7, description: 'Subject is attuned to the target; resonance is a physical force here, so attunement is a real edge.', id: 'attuned_to' },
  { category: 'technical', defaultStrength: 0.5, description: 'Subject built the target.', id: 'built' },
  { category: 'technical', defaultStrength: 0.5, description: 'Subject process is conducted by the target.', id: 'conducted_by' },
  { category: 'technical', defaultStrength: 0.6, description: 'Subject depends on the target to survive or function.', id: 'depends_on' },
  { category: 'technical', defaultStrength: 0.5, description: 'Subject is derived from the target.', id: 'derived_from' },
  { category: 'technical', defaultStrength: 0.5, description: 'Subject designed the target.', id: 'designed' },
  { category: 'technical', defaultStrength: 0.6, description: 'Subject powers the target.', id: 'powers' },
  { category: 'technical', defaultStrength: 0.5, description: 'Subject is sourced from the target.', id: 'sourced_from' },

  // Narrative — meaning and sympathy.
  { category: 'narrative', defaultStrength: 0.6, description: 'Subject embodies the target concept.', id: 'embodies' },
  { category: 'narrative', defaultStrength: 0.6, description: 'Subject resonates with the target in the sympathetic, narrative sense.', id: 'resonates_with' },

  // DM-only — the GM sees these; players never do directly.
  { category: 'dm', defaultStrength: 0.8, description: 'DM-only: subject is hiding from or avoiding the target.', id: 'hiding_from' },
  { category: 'dm', defaultStrength: 0.8, description: 'DM-only: the False Form reaches through the target here.', id: 'seeping_through' },

  {
    category: 'banned',
    defaultStrength: 0,
    description: 'Generic association. Declared so validation can reject it by name; use the narrowest verb that states the actual fact.',
    id: 'related_to',
  },
] as const;

/**
 * The tag vocabulary, verbatim from the world schema. Lore fragment tags are
 * validated against this list, mirroring the source's linter.
 */
const WORLD_TAG_DEFS = [
  { description: 'Artificial intelligence, custodian systems', id: 'AI' },
  { description: 'Political resistance, reform movements', id: 'activism' },
  { description: 'Record-keeping, history preservation, memory', id: 'archives' },
  { description: 'Destructive events', id: 'catastrophe' },
  { description: 'The fundamental order of reality; metaphysics of resonance, the Three Forms, the wider cosmic order', id: 'cosmology' },
  { description: 'High-risk environment or situation', id: 'danger' },
  { description: 'Inter-faction or inter-settlement negotiation', id: 'diplomacy' },
  { description: 'Cultural drift between isolated communities', id: 'divergence' },
  { description: 'Environmental stewardship, conservation', id: 'ecology' },
  { description: 'Physics/reality is loosened or mutable at this location', id: 'fluid-reality' },
  { description: 'Origin events, establishment', id: 'founding' },
  { description: 'Political systems, authority structures, law', id: 'governance' },
  { description: 'Everyday items, domestic technology', id: 'household' },
  { description: 'Signal Famine era disconnection', id: 'isolation' },
  { description: 'Mid-band resonance; motion, heat, force', id: 'kinetic-freq' },
  { description: 'Passed into myth; historicity debated by general population', id: 'legend' },
  { description: 'Physical resources, raw or processed', id: 'materials' },
  { description: 'Armed forces, warships, defense', id: 'military' },
  { description: 'Music as cultural or structural force', id: 'music' },
  { description: 'Unexplained gaps, unsolved questions, active investigation', id: 'mystery' },
  { description: 'Wayfinding, piloting, route knowledge', id: 'navigation' },
  { description: 'In orbit, the ring, or the Shear', id: 'orbital' },
  { description: 'Origin story or inciting incident for current state', id: 'origin' },
  { description: 'Beyond Kaleidos orbit', id: 'outer-system' },
  { description: 'Reclamation-era reconnection and reconstruction', id: 'rebuilding' },
  { description: 'Belief systems, spiritual practice', id: 'religion' },
  { description: 'Involves the resonance energy system', id: 'resonance' },
  { description: 'Predates the Glassfall; original builder technology', id: 'ring-era' },
  { description: 'A habitat on the Glass Frontier ring fragments', id: 'ring-hab' },
  { description: 'Involves ringglass as a material or commodity', id: 'ringglass' },
  { description: 'Shear salvage operations, scavenging', id: 'salvage' },
  { description: 'High-band resonance; communication, data, memory', id: 'signal-freq' },
  { description: 'Class, caste, citizenship, social hierarchy', id: 'social-structure' },
  { description: 'Intelligent species, biology, racial characteristics', id: 'species' },
  { description: 'Low-band resonance; reinforcement, building', id: 'structural-freq' },
  { description: 'Located on the Kaleidos planetary surface', id: 'surface' },
  { description: 'Commerce, supply chains, economics', id: 'trade' },
  { description: 'Education, apprenticeship, attunement learning', id: 'training' },
  { description: 'Ships, trade routes, logistics infrastructure', id: 'transport' },
] as const;

/** Every kind identifier the world accepts. */
export type WorldKindId = (typeof KIND_DEFS)[number]['id'];
/** Every subkind identifier, across all kinds. */
export type WorldSubkindId = (typeof KIND_DEFS)[number]['subkinds'][number];
export type ProminenceId = (typeof PROMINENCE_DEFS)[number]['id'];
export type RelationshipTypeId = (typeof RELATIONSHIP_TYPE_DEFS)[number]['id'];
export type WorldTagId = (typeof WORLD_TAG_DEFS)[number]['id'];

export const WORLD_PROMINENCE: readonly ProminenceDefinition[] = PROMINENCE_DEFS;
export const WORLD_KINDS: readonly WorldKindDefinition[] = KIND_DEFS;
export const RELATIONSHIP_TYPES: readonly RelationshipTypeDefinition[] = RELATIONSHIP_TYPE_DEFS;
export const WORLD_TAGS: readonly WorldTagDefinition[] = WORLD_TAG_DEFS;

const asEnumValues = <T extends string>(values: readonly T[]): [T, ...T[]] => {
  const [first, ...rest] = values;
  if (first === undefined) {
    throw new Error('World vocabulary produced an empty value set');
  }
  return [first, ...rest];
};

export const WORLD_KIND_IDS = asEnumValues(KIND_DEFS.map((kind) => kind.id));
export const WORLD_SUBKIND_IDS = asEnumValues([
  ...new Set(KIND_DEFS.flatMap((kind) => kind.subkinds)),
]);
export const WORLD_PROMINENCE_IDS = asEnumValues(PROMINENCE_DEFS.map((tier) => tier.id));
export const RELATIONSHIP_TYPE_IDS = asEnumValues(
  RELATIONSHIP_TYPE_DEFS.map((type) => type.id)
);
export const WORLD_TAG_IDS: ReadonlySet<string> = new Set(
  WORLD_TAG_DEFS.map((tag) => tag.id)
);

/** Relationship verbs a writer may use. Excludes the banned category. */
export const WRITABLE_RELATIONSHIP_TYPES = RELATIONSHIP_TYPES.filter(
  (type) => type.category !== 'banned'
);

export const BANNED_RELATIONSHIP_TYPE_IDS: ReadonlySet<string> = new Set(
  RELATIONSHIP_TYPES.filter((type) => type.category === 'banned').map((type) => type.id)
);

const relationshipTypesById = new Map<string, RelationshipTypeDefinition>(
  RELATIONSHIP_TYPES.map((type) => [type.id, type])
);

export const getRelationshipType = (id: string): RelationshipTypeDefinition | undefined =>
  relationshipTypesById.get(id);

export const relationshipDefaultStrength = (id: string): number =>
  relationshipTypesById.get(id)?.defaultStrength ?? 0;

const kindsById = new Map<string, WorldKindDefinition>(
  WORLD_KINDS.map((kind) => [kind.id, kind])
);

export const getWorldKind = (id: string): WorldKindDefinition | undefined => kindsById.get(id);

export const isLocationKind = (kind: string): boolean =>
  (LOCATION_KINDS as readonly string[]).includes(kind);

/**
 * Whether the relationship may connect these kinds. Mirrors the source schema:
 * any pair is legal unless the relation declares a constraint (only
 * `fought_over` does).
 */
export const isRelationshipAllowed = (
  relationshipId: string,
  srcKind: string,
  dstKind: string
): boolean => {
  const type = relationshipTypesById.get(relationshipId);
  if (type === undefined || type.category === 'banned') {
    return false;
  }
  if (type.constraint === undefined) {
    return true;
  }
  return type.constraint.srcKind === srcKind && type.constraint.dstKind === dstKind;
};
