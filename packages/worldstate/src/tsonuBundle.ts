import { CanonProposal, type HardStateFacts } from '@glass-frontier/dto';

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

export type TsonuConnection = {
  direction: 'incoming' | 'outgoing';
  relation: string;
  entry_id: string;
  from?: number | null;
  to?: number | null;
};

export type TsonuEntry = {
  id: string;
  title: string;
  kind: string;
  subkind: string | null;
  tags: string[];
  prominence: string | null;
  aliases: string[];
  summary: string | null;
  sections: TsonuSection[];
  facts: TsonuFact[];
  connections: TsonuConnection[];
};

export type TsonuBundle = {
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
  const entries = Object.values(bundle.entries)
    .map(({ entry }) => entry)
    .sort((a, b) => a.id.localeCompare(b.id));
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
  externalKey: key(entry.id),
  facts: buildFacts(entry),
  kind: entry.kind,
  name: entry.title,
  prominence: entry.prominence ?? undefined,
  // The source schema gives every kind a kind-named default subkind; the
  // bundle stamps it on entries that declare none. Glass drops that echo.
  subkind: entry.subkind === entry.kind ? undefined : entry.subkind ?? undefined,
});

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
 * Authoring-structure relations, not world facts: `embeds` is the transclusion
 * link (its prose already imports on the owning entry) and `extends` is entry
 * inheritance. Glass does not adopt that layer.
 */
export const STRUCTURAL_RELATIONS = new Set(['embeds', 'extends']);

const buildRelationships = (entry: TsonuEntry): unknown[] =>
  entry.connections
    .filter(
      (connection) =>
        connection.direction === 'outgoing' && !STRUCTURAL_RELATIONS.has(connection.relation)
    )
    .map((connection) => ({
      dst: { externalKey: key(connection.entry_id) },
      relationship: connection.relation,
      since: connection.from ?? undefined,
      src: { externalKey: key(entry.id) },
      until: connection.to ?? undefined,
    }));
