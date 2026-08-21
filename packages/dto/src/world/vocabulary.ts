/**
 * The world vocabulary: the single canonical source for entity kinds, subkinds,
 * statuses, prominence tiers, relationship types, and the rules constraining
 * which relationship may connect which kinds.
 *
 * This artifact is the authority. The Zod validators in this package are derived
 * from it, and the database vocabulary tables are seeded from it. Nothing writes
 * the vocabulary at runtime — changing the world's shape means editing this file.
 */

export type WorldKindCategory = 'real' | 'idea';

export type WorldKindDefinition = {
  id: WorldKindId;
  category: WorldKindCategory;
  displayName: string;
  defaultStatus: WorldStatusId;
  subkinds: readonly WorldSubkindId[];
  statuses: readonly WorldStatusId[];
};

/**
 * Relationship categories group verbs by the kind of fact they assert.
 * `banned` marks a verb that is declared so validation can reject it by name
 * rather than by silence — a generic edge carries nothing a later query or a
 * prompt can act on.
 */
export type RelationshipCategory =
  | 'spatial'
  | 'social'
  | 'organizational'
  | 'custodial'
  | 'doctrinal'
  | 'causal'
  | 'informational'
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
};

export type ProminenceDefinition = {
  id: ProminenceId;
  rank: number;
};

export type RelationshipRule = {
  relationshipId: RelationshipTypeId;
  srcKind: WorldKindId;
  dstKind: WorldKindId;
};

const PROMINENCE_DEFS = [
  { id: 'forgotten', rank: 0 },
  { id: 'marginal', rank: 1 },
  { id: 'recognized', rank: 2 },
  { id: 'renowned', rank: 3 },
  { id: 'mythic', rank: 4 },
] as const;

const KIND_DEFS = [
  {
    category: 'real',
    defaultStatus: 'known',
    displayName: 'Location',
    id: 'location',
    statuses: ['known', 'hidden', 'lost', 'ruined', 'destroyed'],
    subkinds: [
      'planet', 'moon', 'region', 'city', 'district', 'shop_or_tavern', 'habitat',
      'station', 'space_anomaly', 'site', 'dungeon', 'facility',
    ],
  },
  {
    category: 'real',
    defaultStatus: 'alive',
    displayName: 'NPC',
    id: 'npc',
    statuses: ['alive', 'dead', 'missing', 'retired', 'ascended'],
    subkinds: [
      'civilian', 'leader', 'ally', 'notorious_villain', 'agent', 'merchant',
      'scholar', 'captain', 'mystic',
    ],
  },
  {
    category: 'real',
    defaultStatus: 'alive',
    displayName: 'Creature',
    id: 'creature',
    statuses: ['alive', 'dead', 'dormant'],
    subkinds: ['animal', 'anomaly'],
  },
  {
    category: 'real',
    defaultStatus: 'operational',
    displayName: 'Ship / Vehicle',
    id: 'ship_or_vehicle',
    statuses: ['operational', 'damaged', 'destroyed', 'missing', 'mothballed'],
    subkinds: [
      'capital_ship', 'frigate', 'courier', 'shuttle', 'gunship', 'lander',
      'walker', 'train', 'caravan',
    ],
  },
  {
    category: 'real',
    defaultStatus: 'intact',
    displayName: 'Artifact',
    id: 'artifact',
    statuses: ['intact', 'broken', 'lost', 'sealed', 'corrupted'],
    subkinds: ['relic', 'weapon', 'focus', 'device', 'data_relic', 'key', 'containment_relic'],
  },
  {
    category: 'real',
    defaultStatus: 'active',
    displayName: 'Faction',
    id: 'faction',
    statuses: ['active', 'fragmented', 'dormant', 'destroyed', 'outlawed'],
    subkinds: ['government', 'corporate', 'outlaw', 'guild', 'order', 'cartel', 'militia'],
  },
  {
    category: 'real',
    defaultStatus: 'common',
    displayName: 'Resource',
    id: 'resource',
    statuses: ['abundant', 'common', 'scarce', 'depleted', 'mythical'],
    subkinds: ['strategic', 'mundane', 'hyperdrive_fuel', 'spirit_dust', 'ore', 'data', 'biomass'],
  },
  {
    category: 'idea',
    defaultStatus: 'sanctioned',
    displayName: 'Magic',
    id: 'magic',
    statuses: ['sanctioned', 'forbidden', 'forgotten', 'experimental'],
    subkinds: ['school', 'spell', 'ritual', 'tradition', 'forbidden_technique'],
  },
  {
    category: 'idea',
    defaultStatus: 'minority',
    displayName: 'Faith',
    id: 'faith',
    statuses: ['dominant', 'major', 'minority', 'heresy', 'suppressed', 'extinct'],
    subkinds: ['religion', 'cult', 'philosophy', 'mystery_cult', 'state_church'],
  },
  {
    category: 'idea',
    defaultStatus: 'brewing',
    displayName: 'Conflict',
    id: 'conflict',
    statuses: ['brewing', 'active', 'stalemated', 'won', 'lost', 'frozen'],
    subkinds: ['war', 'rebellion', 'insurgency', 'cold_war', 'proxy_war', 'shadow_conflict'],
  },
  {
    category: 'idea',
    defaultStatus: 'fresh',
    displayName: 'Rumor',
    id: 'rumor',
    statuses: ['fresh', 'spreading', 'confirmed', 'debunked', 'forgotten'],
    subkinds: ['local', 'regional', 'cosmic', 'personal', 'prophecy'],
  },
  {
    category: 'idea',
    defaultStatus: 'enacted',
    displayName: 'Law or Edict',
    id: 'law_or_edict',
    statuses: ['drafted', 'enacted', 'contested', 'ignored', 'repealed'],
    subkinds: ['civil_law', 'religious_law', 'martial_law', 'corporate_policy', 'treaty'],
  },
] as const;

const RELATIONSHIP_TYPE_DEFS = [
  { category: 'spatial', defaultStrength: 0.2, description: 'Two locations are physically or spatially adjacent.', id: 'adjacent_to' },
  { category: 'spatial', defaultStrength: 0.4, description: 'Subject location or container holds the target within it.', id: 'contains' },
  { category: 'spatial', defaultStrength: 0.4, description: 'Subject is contained within the target.', id: 'contained_within' },
  { category: 'spatial', defaultStrength: 0.3, description: 'Locations are linked by an explicit route or gate.', id: 'connected_by' },
  { category: 'spatial', defaultStrength: 0.6, description: 'Subject NPC or creature normally lives in the target location.', id: 'resides_in' },
  { category: 'spatial', defaultStrength: 0.4, description: 'Subject NPC or creature regularly visits the target location.', id: 'frequents' },
  { category: 'spatial', defaultStrength: 0.5, description: 'Subject NPC works at the target location.', id: 'works_at' },
  { category: 'spatial', defaultStrength: 0.4, description: 'Subject location is inhabited by the target NPC, creature, or group.', id: 'inhabited_by' },
  { category: 'spatial', defaultStrength: 0.3, description: 'Subject ship is currently docked at or stationed at the target location.', id: 'docked_at' },
  { category: 'spatial', defaultStrength: 0.4, description: 'Subject ship or faction regularly patrols the target location or region.', id: 'patrols' },
  { category: 'spatial', defaultStrength: 0.2, description: 'Subject ship or habitat orbits the target celestial body.', id: 'orbits' },

  { category: 'organizational', defaultStrength: 0.7, description: 'Subject faction or NPC exercises authority over the target.', id: 'controls' },
  { category: 'organizational', defaultStrength: 0.7, description: 'Subject NPC or ship belongs to the target faction or faith.', id: 'member_of' },
  { category: 'organizational', defaultStrength: 0.9, description: 'Subject NPC leads the target faction or faith.', id: 'leader_of' },
  { category: 'organizational', defaultStrength: 0.8, description: 'Subject NPC acts covertly on behalf of the target faction or faith.', id: 'agent_of' },
  { category: 'organizational', defaultStrength: 0.7, description: 'Subject faction, NPC, or ship enforces the target law or edict.', id: 'enforces' },
  { category: 'organizational', defaultStrength: 0.5, description: 'Subject law or edict applies within the target location or jurisdiction.', id: 'in_effect_in' },
  { category: 'organizational', defaultStrength: 0.6, description: 'Subject faction or faith claims authority over the target location, resource, or group.', id: 'claims' },
  { category: 'organizational', defaultStrength: 0.5, description: 'Subject faction, faith, or magic strongly shapes the target location or group.', id: 'influences' },

  { category: 'social', defaultStrength: 0.7, description: 'Subject NPC, faction, or ship is an ally of the target.', id: 'ally_of' },
  { category: 'social', defaultStrength: 0.8, description: 'Subject NPC, faction, or ship is an enemy of the target.', id: 'enemy_of' },
  { category: 'social', defaultStrength: 0.8, description: 'Subject NPC is family or blood-related to the target NPC.', id: 'kin_of' },
  { category: 'social', defaultStrength: 0.7, description: 'Subject NPC is a teacher or mentor to the target NPC.', id: 'mentor_of' },
  { category: 'social', defaultStrength: 0.6, description: 'Subject NPC or faction owes a significant favor to the target.', id: 'owes_favor_to' },
  { category: 'social', defaultStrength: 0.9, description: 'Subject has betrayed the target.', id: 'betrayed' },

  { category: 'custodial', defaultStrength: 0.4, description: 'Subject artifact or resource is stored at the target location.', id: 'stored_at' },
  { category: 'custodial', defaultStrength: 0.5, description: 'Subject artifact or resource was discovered at the target location.', id: 'discovered_at' },
  { category: 'custodial', defaultStrength: 0.6, description: 'Subject artifact or remains are sealed within the target.', id: 'entombed_within' },
  { category: 'custodial', defaultStrength: 0.8, description: 'Subject NPC or faction actively uses the target artifact.', id: 'wields' },

  { category: 'doctrinal', defaultStrength: 0.6, description: 'Subject NPC, faction, or faith studies the target magic, resource, artifact, creature, or phenomenon.', id: 'studies' },
  { category: 'doctrinal', defaultStrength: 0.8, description: 'Subject faith or law forbids the target magic, artifact, practice, or behavior.', id: 'prohibits' },
  { category: 'doctrinal', defaultStrength: 0.6, description: 'Subject faith, faction, or law formally permits or regulates the target.', id: 'sanctions' },
  { category: 'doctrinal', defaultStrength: 0.8, description: 'Subject NPC or faction venerates the target faith, artifact, or entity.', id: 'worships' },
  { category: 'doctrinal', defaultStrength: 0.8, description: 'Subject faith, faction, or law opposes the target faith, law, or practice.', id: 'opposes' },
  { category: 'doctrinal', defaultStrength: 0.7, description: 'Subject is attuned to or resonates with the target magic, phenomenon, or entity.', id: 'attuned_to' },

  { category: 'causal', defaultStrength: 0.8, description: 'Subject NPC, faction, or faith actively seeks the target artifact, resource, or magic.', id: 'seeks' },
  { category: 'causal', defaultStrength: 0.6, description: 'Subject location or resource is the origin or source of the target resource or magic.', id: 'source_of' },
  { category: 'causal', defaultStrength: 0.5, description: 'Subject location or resource has lost or spent the target resource.', id: 'depleted_of' },
  { category: 'causal', defaultStrength: 0.7, description: 'Subject NPC, faction, or location is in violation of the target law or edict.', id: 'violates' },
  { category: 'causal', defaultStrength: 0.9, description: 'Subject law, resource, or event is a significant cause of the target conflict.', id: 'cause_of' },
  { category: 'causal', defaultStrength: 0.9, description: 'Subject NPC, faction, or ship actively participates in the target conflict.', id: 'fights_in' },
  { category: 'causal', defaultStrength: 0.7, description: 'Subject conflict is actively fought in or around the target location.', id: 'battleground_in' },
  { category: 'causal', defaultStrength: 0.6, description: 'Subject rumor or conflict originated from the target entity or event.', id: 'spawned_by' },
  { category: 'causal', defaultStrength: 0.6, description: 'Subject creature depends on the target resource, artifact, or magic to survive or function.', id: 'depends_on' },
  { category: 'causal', defaultStrength: 0.8, description: 'Subject is a direct outcome of the target conflict or event.', id: 'outcome_of' },

  { category: 'informational', defaultStrength: 0.5, description: 'Subject rumor concerns the target entity.', id: 'rumors_about' },
  { category: 'informational', defaultStrength: 0.4, description: 'Subject law, rumor, or artifact records or encodes information about the target.', id: 'documents' },

  {
    category: 'banned',
    defaultStrength: 0,
    description: 'Generic association. Declared so validation can reject it by name; use the narrowest verb that states the actual fact.',
    id: 'related_to',
  },
] as const;

/** Every kind identifier the world accepts. */
export type WorldKindId = (typeof KIND_DEFS)[number]['id'];
/** Every subkind identifier, across all kinds. */
export type WorldSubkindId = (typeof KIND_DEFS)[number]['subkinds'][number];
/** Every status identifier, across all kinds. */
export type WorldStatusId = (typeof KIND_DEFS)[number]['statuses'][number];
export type ProminenceId = (typeof PROMINENCE_DEFS)[number]['id'];
export type RelationshipTypeId = (typeof RELATIONSHIP_TYPE_DEFS)[number]['id'];

export const WORLD_PROMINENCE: readonly ProminenceDefinition[] = PROMINENCE_DEFS;
export const WORLD_KINDS: readonly WorldKindDefinition[] = KIND_DEFS;
export const RELATIONSHIP_TYPES: readonly RelationshipTypeDefinition[] = RELATIONSHIP_TYPE_DEFS;

/**
 * Allowed relationships per source kind, keyed by destination kind.
 * Edges are stored in the declared direction; traversal reads both ways.
 */
const RELATIONSHIP_RULE_MAP: Record<
  WorldKindId,
  Partial<Record<WorldKindId, readonly RelationshipTypeId[]>>
> = {
  artifact: {
    conflict: ['cause_of'],
    faction: ['wields', 'seeks'],
    faith: ['worships', 'documents'],
    law_or_edict: ['documents', 'prohibits', 'sanctions'],
    location: ['stored_at', 'discovered_at', 'entombed_within'],
    magic: ['source_of', 'studies', 'attuned_to'],
    npc: ['wields', 'seeks'],
    resource: ['source_of'],
    rumor: ['rumors_about', 'spawned_by'],
  },
  conflict: {
    faction: ['fights_in', 'cause_of'],
    faith: ['cause_of'],
    law_or_edict: ['cause_of', 'outcome_of'],
    location: ['battleground_in'],
    magic: ['cause_of'],
    npc: ['fights_in'],
    resource: ['cause_of'],
    rumor: ['rumors_about', 'spawned_by'],
    ship_or_vehicle: ['fights_in'],
  },
  creature: {
    artifact: ['depends_on'],
    conflict: ['outcome_of'],
    creature: ['attuned_to'],
    faction: ['attuned_to'],
    location: ['resides_in', 'frequents', 'attuned_to'],
    magic: ['attuned_to', 'depends_on'],
    npc: ['attuned_to'],
    resource: ['depends_on'],
    ship_or_vehicle: ['attuned_to'],
  },
  faction: {
    artifact: ['wields', 'seeks'],
    conflict: ['fights_in', 'cause_of'],
    creature: ['studies'],
    faction: ['ally_of', 'enemy_of', 'member_of', 'opposes'],
    faith: ['ally_of', 'opposes', 'member_of'],
    law_or_edict: ['enforces', 'violates', 'documents'],
    location: ['controls', 'influences', 'claims'],
    magic: ['studies', 'sanctions', 'prohibits'],
    npc: ['member_of', 'leader_of', 'agent_of', 'ally_of', 'enemy_of'],
    resource: ['controls', 'seeks', 'source_of'],
    rumor: ['rumors_about'],
    ship_or_vehicle: ['member_of', 'controls', 'agent_of'],
  },
  faith: {
    conflict: ['cause_of'],
    faction: ['member_of', 'ally_of', 'opposes'],
    faith: ['ally_of', 'opposes'],
    law_or_edict: ['documents', 'cause_of'],
    location: ['influences', 'controls'],
    magic: ['sanctions', 'prohibits'],
    npc: ['worships', 'member_of', 'opposes'],
    rumor: ['rumors_about', 'spawned_by'],
  },
  law_or_edict: {
    artifact: ['documents'],
    conflict: ['cause_of'],
    faction: ['enforces', 'violates'],
    faith: ['documents', 'opposes'],
    location: ['in_effect_in'],
    magic: ['prohibits', 'sanctions'],
    npc: ['enforces', 'violates'],
    rumor: ['rumors_about', 'spawned_by'],
  },
  location: {
    artifact: ['stored_at', 'discovered_at', 'entombed_within'],
    conflict: ['battleground_in'],
    creature: ['inhabited_by'],
    faction: ['controls', 'influences', 'claims'],
    law_or_edict: ['in_effect_in'],
    location: ['adjacent_to', 'contains', 'contained_within', 'connected_by'],
    magic: ['attuned_to'],
    npc: ['inhabited_by'],
    resource: ['source_of', 'depleted_of'],
    rumor: ['rumors_about'],
    ship_or_vehicle: ['docked_at', 'patrols', 'orbits'],
  },
  magic: {
    artifact: ['source_of', 'documents'],
    conflict: ['cause_of'],
    faction: ['studies', 'sanctions', 'prohibits'],
    faith: ['worships', 'opposes'],
    law_or_edict: ['prohibits', 'sanctions'],
    location: ['influences'],
    npc: ['wields', 'studies'],
    rumor: ['rumors_about', 'spawned_by'],
  },
  npc: {
    artifact: ['wields', 'seeks'],
    conflict: ['fights_in', 'cause_of'],
    creature: ['studies'],
    faction: ['member_of', 'leader_of', 'agent_of', 'ally_of', 'enemy_of'],
    faith: ['worships', 'member_of', 'opposes'],
    law_or_edict: ['violates', 'enforces'],
    location: ['resides_in', 'frequents', 'works_at'],
    magic: ['studies', 'wields', 'attuned_to'],
    npc: ['ally_of', 'enemy_of', 'kin_of', 'mentor_of', 'owes_favor_to', 'betrayed'],
    resource: ['seeks'],
    rumor: ['rumors_about'],
    ship_or_vehicle: ['controls', 'member_of'],
  },
  resource: {
    artifact: ['contained_within', 'source_of'],
    conflict: ['cause_of'],
    faction: ['controls', 'seeks', 'cause_of'],
    location: ['source_of', 'depleted_of'],
    magic: ['source_of', 'studies'],
    rumor: ['rumors_about', 'spawned_by'],
    ship_or_vehicle: ['source_of', 'stored_at'],
  },
  rumor: {
    artifact: ['rumors_about'],
    conflict: ['rumors_about'],
    creature: ['rumors_about'],
    faction: ['rumors_about'],
    faith: ['rumors_about'],
    law_or_edict: ['rumors_about'],
    location: ['rumors_about'],
    magic: ['rumors_about'],
    npc: ['rumors_about'],
    resource: ['rumors_about'],
    ship_or_vehicle: ['rumors_about'],
  },
  ship_or_vehicle: {
    artifact: ['stored_at', 'wields'],
    conflict: ['fights_in'],
    faction: ['member_of', 'agent_of', 'ally_of', 'enemy_of'],
    location: ['docked_at', 'patrols', 'orbits'],
    magic: ['attuned_to'],
    npc: ['member_of', 'controls'],
    resource: ['stored_at', 'source_of'],
  },
};

export const RELATIONSHIP_RULES: readonly RelationshipRule[] = Object.entries(
  RELATIONSHIP_RULE_MAP
).flatMap(([srcKind, destinations]) =>
  Object.entries(destinations).flatMap(([dstKind, relationships]) =>
    (relationships ?? []).map((relationshipId) => ({
      dstKind: dstKind as WorldKindId,
      relationshipId,
      srcKind: srcKind as WorldKindId,
    }))
  )
);

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
export const WORLD_STATUS_IDS = asEnumValues([
  ...new Set(KIND_DEFS.flatMap((kind) => kind.statuses)),
]);
export const WORLD_PROMINENCE_IDS = asEnumValues(PROMINENCE_DEFS.map((tier) => tier.id));
export const RELATIONSHIP_TYPE_IDS = asEnumValues(
  RELATIONSHIP_TYPE_DEFS.map((type) => type.id)
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

const ruleKeys = new Set(
  RELATIONSHIP_RULES.map((rule) => `${rule.relationshipId}:${rule.srcKind}:${rule.dstKind}`)
);

export const isRelationshipAllowed = (
  relationshipId: string,
  srcKind: string,
  dstKind: string
): boolean => ruleKeys.has(`${relationshipId}:${srcKind}:${dstKind}`);

/** Verbs legal from `srcKind` to `dstKind`, for constraining a proposal writer. */
export const allowedRelationships = (srcKind: string, dstKind: string): string[] => {
  const destinations = Object.hasOwn(RELATIONSHIP_RULE_MAP, srcKind)
    ? RELATIONSHIP_RULE_MAP[srcKind as WorldKindId]
    : undefined;
  if (destinations === undefined || !Object.hasOwn(destinations, dstKind)) {
    return [];
  }
  return [...(destinations[dstKind as WorldKindId] ?? [])];
};
