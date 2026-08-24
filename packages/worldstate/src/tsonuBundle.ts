import {
  CanonProposal,
  type GmNote,
  type HardStateFacts,
  type IdentityContribution,
  type IdentityLocal,
  type IdentityProvenance,
  type IdentitySourceAssignment,
  type PlayableRole,
} from '@glass-frontier/dto';

/**
 * The slice of tsonu-canon's internal site bundle
 * (`build/site-internal/worlds/glass-frontier.json`) this importer consumes.
 * The bundle is audience-complete: DM entries and prose are present and are
 * imported like everything else.
 */
export type TsonuSection = {
  format: string;
  section: string | null;
  heading: string | null;
  markdown: string;
  /** Entity or relation id whose source file declares this prose. */
  owner_id: string | null;
};

export type TsonuFact = {
  id: string;
  value?: string | number | null;
  links?: Array<{ title: string }>;
};

export type TsonuIdentitySource = {
  slot: string;
  id: string;
  via: 'direct' | 'relation';
  relation?: string | null;
};

export type TsonuIdentityLocalValue = {
  operation: 'extend' | 'override';
  text: string;
};

export type TsonuIdentityContribution = {
  key: string;
  text: string;
  operation: 'extend' | 'override' | 'replace';
  owner_type: string;
  owner_id: string;
  source_slot?: string | null;
  source_id?: string | null;
  source_key?: string | null;
  suppressed: boolean;
};

/** The descriptive-identity surface shared by entries and connections. */
export type TsonuIdentityOwner = {
  descriptive_identity?: Record<string, string>;
  identity_sources?: TsonuIdentitySource[];
  identity_local?: Record<string, TsonuIdentityLocalValue>;
  identity_provenance?: Record<string, TsonuIdentityContribution[]>;
};

export type TsonuConnection = TsonuIdentityOwner & {
  direction: 'incoming' | 'outgoing';
  relation: string;
  entry_id: string;
  from?: number | null;
  live: boolean;
  to?: number | null;
  /** Typed relation properties declared by the source schema. */
  properties?: Record<string, string | number | boolean> | null;
};

export type TsonuPosition = {
  frame_id: string;
  relative_to_id?: string | null;
  coordinates: Record<string, string | number>;
};

export type TsonuRouteGeometry = {
  frame_id: string;
  points: Array<{
    id: string;
    kind: 'anchor' | 'point';
    entity_id?: string | null;
    coordinates?: Record<string, string | number> | null;
  }>;
  paths: Array<{ id: string; through: string[] }>;
};

export type TsonuEntry = TsonuIdentityOwner & {
  id: string;
  title: string;
  kind: string;
  subkind: string | null;
  tags: string[];
  prominence: string | null;
  aliases: string[];
  dm: boolean;
  summary: string | null;
  sections: TsonuSection[];
  facts: TsonuFact[];
  connections: TsonuConnection[];
  is_article: boolean;
  origin_blurb?: string | false;
  playable_as: PlayableRole[];
  positions?: TsonuPosition[];
  route_geometry?: TsonuRouteGeometry | null;
  veiled: boolean;
  veil_tagline?: string;
  /** How to run the entry, declared on the source entity. */
  gm_notes?: GmNote[];
};

export type TsonuBundle = {
  schema_version: number;
  revision: string;
  entries: Record<string, { entry: TsonuEntry }>;
};

/** Stable import identity: the tsonu entity or section id under a source prefix. */
const key = (id: string): string => `tsonu:${id}`;

/**
 * Maps the tsonu bundle to one canon proposal: every entry becomes an entity,
 * every prose block it owns becomes a lore fragment, and every outgoing
 * connection becomes a relationship. The bundle lists each edge exactly once as
 * outgoing on its source entry, so no dedup is needed.
 *
 * Prose a page shows but another entry owns is a transclusion and is skipped
 * here — it imports once, on its owner. Prose owned by a relation (or by
 * nothing in the bundle) renders on exactly one page and imports there, keyed
 * by its owner id so re-ingest updates in place.
 */
export const buildTsonuProposal = (bundle: TsonuBundle): CanonProposal => {
  if (!Number.isInteger(bundle.schema_version) || bundle.schema_version < 6) {
    throw new Error(`Tsonu bundle schema ${bundle.schema_version} does not include canon metadata`);
  }
  const entries = Object.values(bundle.entries)
    .map(({ entry }) => entry)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const entry of entries) {
    if (
      typeof entry.dm !== 'boolean'
      || typeof entry.is_article !== 'boolean'
      || !Array.isArray(entry.playable_as)
      || typeof entry.veiled !== 'boolean'
      || (entry.veiled && typeof entry.veil_tagline !== 'string')
    ) {
      throw new Error(`Tsonu entry ${entry.id} is missing canon metadata`);
    }
  }
  const entryIds = new Set(entries.map((entry) => entry.id));

  return CanonProposal.parse({
    entities: entries.map((entry) => buildEntity(entry)),
    lore: entries.flatMap((entry) => buildLore(entry, entryIds)),
    relationships: entries.flatMap((entry) => buildRelationships(entry)),
    source: 'import',
    sourceId: `tsonu-canon@${bundle.revision}`,
  });
};

const buildEntity = (entry: TsonuEntry): unknown => ({
  description: entry.summary ?? undefined,
  dm: entry.dm,
  externalKey: key(entry.id),
  facts: buildFacts(entry),
  gmNotes: buildGmNotes(entry),
  ...buildIdentity(entry),
  isArticle: entry.is_article,
  kind: entry.kind,
  name: entry.title,
  originBlurb: typeof entry.origin_blurb === 'string' ? entry.origin_blurb : undefined,
  playableAs: entry.playable_as,
  positions: buildPositions(entry),
  prominence: entry.prominence ?? undefined,
  routeGeometry: buildRouteGeometry(entry),
  // The source schema gives every kind a kind-named default subkind; the
  // bundle stamps it on entries that declare none. Glass drops that echo.
  subkind: entry.subkind === entry.kind ? undefined : entry.subkind ?? undefined,
  veiled: entry.veiled,
  veilTagline: entry.veil_tagline,
});

const buildGmNotes = (entry: TsonuEntry): GmNote[] | undefined => {
  const notes = (entry.gm_notes ?? []).filter((note) => note.text.trim().length > 0);
  return notes.length > 0 ? notes : undefined;
};

/**
 * The descriptive-identity surface of an entry or connection: the resolved
 * snapshot, the source-slot assignments (rewritten to external keys so the
 * inheritance graph survives import), the authored local operations, and the
 * per-key provenance. Inherited prose stays out of the local dictionary.
 */
const buildIdentity = (
  owner: TsonuIdentityOwner
): {
  descriptiveIdentity?: Record<string, string>;
  identityLocal?: IdentityLocal;
  identityProvenance?: IdentityProvenance;
  identitySources?: IdentitySourceAssignment[];
} => {
  const resolved = owner.descriptive_identity ?? {};
  const sources = (owner.identity_sources ?? []).map((source) => ({
    ...(source.relation === null || source.relation === undefined
      ? {}
      : { relation: source.relation }),
    slot: source.slot,
    sourceExternalKey: key(source.id),
    via: source.via,
  }));
  const local: IdentityLocal = Object.fromEntries(
    Object.entries(owner.identity_local ?? {}).map(([name, value]) => [
      name,
      { operation: value.operation, text: value.text },
    ])
  );
  const provenance: IdentityProvenance = Object.fromEntries(
    Object.entries(owner.identity_provenance ?? {}).map(([name, contributions]) => [
      name,
      contributions.map((contribution) => buildContribution(contribution)),
    ])
  );
  return {
    ...(Object.keys(resolved).length > 0 ? { descriptiveIdentity: resolved } : {}),
    ...(Object.keys(local).length > 0 ? { identityLocal: local } : {}),
    ...(Object.keys(provenance).length > 0 ? { identityProvenance: provenance } : {}),
    ...(sources.length > 0 ? { identitySources: sources } : {}),
  };
};

const buildContribution = (contribution: TsonuIdentityContribution): IdentityContribution => ({
  key: contribution.key,
  operation: contribution.operation,
  ...(contribution.source_id === null || contribution.source_id === undefined
    ? {}
    : { sourceExternalKey: key(contribution.source_id) }),
  ...(contribution.source_key === null || contribution.source_key === undefined
    ? {}
    : { sourceKey: contribution.source_key }),
  ...(contribution.source_slot === null || contribution.source_slot === undefined
    ? {}
    : { sourceSlot: contribution.source_slot }),
  suppressed: contribution.suppressed,
  text: contribution.text,
});

/**
 * Authored spatial positions, with entity references rewritten to the same
 * `tsonu:` external keys the entities import under, so consumers resolve them
 * against `externalKey` instead of guessing at slugs.
 */
const buildPositions = (entry: TsonuEntry): unknown[] | undefined => {
  const positions = (entry.positions ?? []).map((position) => ({
    coordinates: position.coordinates,
    frameId: position.frame_id,
    relativeToId:
      position.relative_to_id === null || position.relative_to_id === undefined
        ? undefined
        : key(position.relative_to_id),
  }));
  return positions.length > 0 ? positions : undefined;
};

const buildRouteGeometry = (entry: TsonuEntry): unknown => {
  const geometry = entry.route_geometry;
  if (geometry === null || geometry === undefined) {
    return undefined;
  }
  return {
    frameId: geometry.frame_id,
    paths: geometry.paths,
    points: geometry.points.map((point) => ({
      coordinates: point.coordinates ?? undefined,
      entityId:
        point.entity_id === null || point.entity_id === undefined
          ? undefined
          : key(point.entity_id),
      id: point.id,
      kind: point.kind,
    })),
  };
};

/**
 * The source fact card, verbatim: typed values as they are, entity-link facts
 * flattened to the linked titles. Aliases ride along as `aka` so alternate
 * names stay queryable.
 */
const buildFacts = (entry: TsonuEntry): HardStateFacts | undefined => {
  const facts: HardStateFacts = {};
  for (const fact of entry.facts) {
    if (fact.links !== undefined) {
      facts[fact.id] = fact.links.map((link) => link.title).join(', ');
    } else if (fact.value !== null && fact.value !== undefined) {
      facts[fact.id] = fact.value;
    }
  }
  if (entry.aliases.length > 0) {
    facts.aka = entry.aliases.join(', ');
  }
  return Object.keys(facts).length > 0 ? facts : undefined;
};

const buildLore = (entry: TsonuEntry, entryIds: Set<string>): unknown[] => {
  const positionBySection = new Map<string, number>();
  const fragments: unknown[] = [];
  for (const section of entry.sections) {
    if (section.format !== 'prose') {
      continue;
    }
    const owner = section.owner_id;
    const transcluded = owner !== null && owner !== entry.id && entryIds.has(owner);
    if (transcluded) {
      continue;
    }
    fragments.push({
      entity: { externalKey: key(entry.id) },
      externalKey: fragmentKey(entry, section, positionBySection),
      prose: section.markdown,
      tags: entry.tags,
      title: section.heading ?? entry.title,
    });
  }
  return fragments;
};

/**
 * Relation-owned prose keys by the relation id, which is globally unique.
 * The entry's own prose keys by section name and position within it, so adding
 * a block to one section does not re-key the others.
 */
const fragmentKey = (
  entry: TsonuEntry,
  section: TsonuSection,
  positionBySection: Map<string, number>
): string => {
  const owner = section.owner_id;
  if (owner !== null && owner !== entry.id) {
    return key(`${entry.id}:${owner}`);
  }
  const name = section.section ?? 'main';
  const position = positionBySection.get(name) ?? 0;
  positionBySection.set(name, position + 1);
  return key(`${entry.id}:${name}:${position}`);
};

/**
 * Entry inheritance is authoring structure rather than a world fact. Glass
 * does not adopt it. `embeds` remains a graph edge because the source uses it
 * when determining chronicle focus choices.
 */
export const STRUCTURAL_RELATIONS = new Set(['extends']);

const buildRelationships = (entry: TsonuEntry): unknown[] =>
  entry.connections
    .filter(
      (connection) =>
        connection.direction === 'outgoing' && !STRUCTURAL_RELATIONS.has(connection.relation)
    )
    .map((connection) => ({
      dst: { externalKey: key(connection.entry_id) },
      ...buildIdentity(connection),
      live: connection.live,
      props:
        connection.properties === null || connection.properties === undefined
          ? undefined
          : connection.properties,
      relationship: connection.relation,
      since: connection.from ?? undefined,
      src: { externalKey: key(entry.id) },
      until: connection.to ?? undefined,
    }));
