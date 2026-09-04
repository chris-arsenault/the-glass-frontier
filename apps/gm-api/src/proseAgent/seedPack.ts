import { renderBlock } from '@glass-frontier/app';
import type {
  EncyclopediaEntrySummary,
  HardState,
  HardStateKind,
  HardStateProminence,
  HardStateStatus,
} from '@glass-frontier/dto';
import { isNonEmptyString } from '@glass-frontier/utils';
import { encyclopediaSummary } from '@glass-frontier/worldstate';

import type { ChronicleFragmentTypes } from '../prompts/chronicleFragments';
import { extractFragment } from '../prompts/chronicleFragments';
import type { GraphContext } from '../types';
import type { ServedReference } from './toolSession';

const INDENT = '  ';

/**
 * The ToC schema is v0 and expected to iterate during shadow review. Nothing
 * outside this module depends on its field list — tools address entities by
 * slug, not by ToC shape.
 */
export type SeedTocEntry = {
  slug: string;
  name: string;
  kind: HardStateKind;
  prominence: HardStateProminence;
  status?: HardStateStatus;
  blurb?: string;
  unwritten: boolean;
  /**
   * How much there is to open, not what it is called. The index used to print
   * `identity: access, hazards, setting, activity`, and a scout that read that
   * as a menu asked `open` for the key named `identity` and got nothing. There
   * are thirty of these key names across the canon and no turn where opening
   * `access` without `hazards` is the right call, so the count is the whole of
   * what a chooser needs.
   */
  noteCount: number;
  factKeys: string[];
  relationships: Array<{
    verb: string;
    direction: 'out' | 'in';
    targetSlug: string;
    targetName: string;
  }>;
  loreCount: number;
};

export type SeedPack = {
  encyclopediaToc: EncyclopediaEntrySummary[];
  sections: Array<{ name: string; value: unknown }>;
  seedReferences: ServedReference[];
  toc: SeedTocEntry[];
};

const MAX_SEED_ENTITIES = 6;
/** bloom_zones printed 21 edges into a hunting turn; a menu is not a database. */
const MAX_INDEX_EDGES = 6;

/**
 * The fragments the seed pack shares with the one-shot prompt, in the order
 * they matter to the scout.
 *
 * CHARACTER leads. It used to sit ninth, below world tracking, and the scout
 * read the turn from the top down as a world with an unnamed actor in it: on
 * The Silent Test it looked the player up in canon, found nothing, and put the
 * one NPC it could read in their place. The player is the subject of the turn
 * and reads first. Everything else follows in the order it constrains the
 * reading — what is being attempted, where, under what pressure, then the
 * standing context the storyteller already holds.
 */
const SHARED_SECTIONS: Array<{ name: string; fragment: ChronicleFragmentTypes }> = [
  { fragment: 'character', name: 'CHARACTER' },
  { fragment: 'intent', name: 'INTENT' },
  { fragment: 'entity-references', name: 'PLAYER-REFERENCES' },
  { fragment: 'location', name: 'LOCATION' },
  { fragment: 'skill-check', name: 'SKILL-CHECK' },
  { fragment: 'threads', name: 'THREADS' },
  { fragment: 'scene', name: 'SCENE' },
  { fragment: 'local-continuity', name: 'LOCAL-CONTINUITY' },
  { fragment: 'recent-events', name: 'RECENT-EVENTS' },
  { fragment: 'inventory-detail', name: 'INVENTORY-DETAIL' },
  { fragment: 'seed', name: 'SEED' },
  { fragment: 'chronicle-tone', name: 'CHRONICLE-TONE' },
  { fragment: 'wrap', name: 'WRAP' },
];

const firstSentence = (text: string | undefined): string | undefined => {
  if (!isNonEmptyString(text)) {
    return undefined;
  }
  const period = text.indexOf('. ');
  return period === -1 ? text : text.slice(0, period + 1);
};

const compareEncyclopediaEntries = (
  left: Parameters<typeof encyclopediaSummary>[0],
  right: Parameters<typeof encyclopediaSummary>[0]
): number => {
  const contextOrder = Number(right.availability?.mode === 'contextual')
    - Number(left.availability?.mode === 'contextual');
  return contextOrder !== 0 ? contextOrder : left.title.localeCompare(right.title);
};

/**
 * Only what this turn actually touches.
 *
 * The index used to open with the curated roster — seven entities chosen by a
 * scorer before anyone knew what the turn was about — and a chronicle about
 * hunting animals in a gas giant carried a pilgrim bead, a Tuner guild, and a
 * region of orbital reality tears for its whole run. The roster is gone: what
 * seeds the index is the place, the anchor, and whatever the player named.
 * Everything else is the scout's to discover
 * with `search`, which is the entire point of giving it tools.
 */
export const collectSeedIds = async (context: GraphContext): Promise<string[]> => {
  const chronicle = context.chronicleState.chronicle;
  const location = await context.worldSchemaStore.findLocationByName({
    name: context.chronicleState.locationName,
  });
  const candidates = [
    chronicle.anchorEntityId,
    ...(context.entityReferences ?? []).map((reference) => reference.entityId),
    ...context.targetEntityIds,
    location?.id,
  ];
  return [...new Set(candidates.filter(isNonEmptyString))].slice(0, MAX_SEED_ENTITIES);
};

const tocEntry = (
  entity: HardState,
  loreCount: number,
  targets: Map<string, HardState>
): SeedTocEntry => ({
  blurb: entity.veiled ? entity.veilTagline : firstSentence(entity.description),
  factKeys: Object.keys(entity.facts),
  kind: entity.kind,
  loreCount,
  name: entity.name,
  noteCount:
    Object.keys(entity.descriptiveIdentity ?? {}).length + (entity.gmNotes ?? []).length,
  prominence: entity.prominence,
  relationships: entity.links
    .filter((link) => link.live !== false)
    .flatMap((link) => {
      const target = targets.get(link.targetId);
      if (target === undefined || target.dm) {
        return [];
      }
      return [{
        direction: link.direction,
        targetName: target.name,
        targetSlug: `atlas:${target.slug}`,
        verb: link.relationship,
      }];
    }),
  slug: `atlas:${entity.slug}`,
  status: entity.status,
  unwritten: entity.veiled && loreCount === 0,
});

/** ToC entries for a set of entities; also serves the `expand` tool. */
export const buildTocEntries = async (
  store: GraphContext['worldSchemaStore'],
  entities: HardState[]
): Promise<SeedTocEntry[]> => {
  const visible = entities.filter((entity) => !entity.dm);
  const targetIds = [...new Set(visible.flatMap(
    (entity) => entity.links.map((link) => link.targetId)
  ))];
  const [targetEntities, stats] = await Promise.all([
    store.listEntitiesByIds(targetIds),
    store.listEntityStats(visible.map((entity) => entity.id)),
  ]);
  const targets = new Map(targetEntities.map((entity) => [entity.id, entity]));
  const loreCounts = new Map(stats.map((stat) => [stat.id, stat.loreCount]));
  return visible.map((entity) => tocEntry(entity, loreCounts.get(entity.id) ?? 0, targets));
};

const buildEncyclopediaToc = (
  applicable: Array<GraphContext['directEncyclopediaEntries'][number]>,
  directEntries: GraphContext['directEncyclopediaEntries']
): EncyclopediaEntrySummary[] => {
  const directSlugs = new Set(directEntries.map((entry) => entry.slug));
  return [...new Map(
    applicable
      .filter((entry) =>
        entry.status === 'complete' && !entry.dm && !directSlugs.has(entry.slug)
      )
      .map((entry) => [entry.slug, entry])
  ).values()]
    .sort(compareEncyclopediaEntries)
    .slice(0, 16)
    .map(encyclopediaSummary);
};

export const buildSeedPack = async (context: GraphContext): Promise<SeedPack> => {
  const seedEntityIds = await collectSeedIds(context);
  const location = await context.worldSchemaStore.findLocationByName({
    name: context.chronicleState.locationName,
  });
  const [entities, sectionValues, applicable] = await Promise.all([
    context.worldSchemaStore.listEntitiesByIds(seedEntityIds),
    Promise.all(
      SHARED_SECTIONS.map(async ({ fragment, name }) => ({
        name,
        value: await extractFragment(fragment, context),
      }))
    ),
    location === null
      ? Promise.resolve([])
      : context.encyclopediaStore.listApplicable({
        terms: location.contextTags.map((tag) => ({
          scope: 'place' as const,
          tag,
          type: 'tag' as const,
        })),
      }),
  ]);
  const visible = entities.filter((entity) => !entity.dm);
  const directAtlasIds = new Set(context.targetEntityIds);
  const encyclopediaToc = buildEncyclopediaToc(
    applicable,
    context.directEncyclopediaEntries
  );
  return {
    encyclopediaToc,
    sections: sectionValues,
    seedReferences: [
      ...visible.filter((entity) => directAtlasIds.has(entity.id)).map((entity) => ({
        atlasEntityId: entity.id,
        atlasSlug: entity.slug,
        slug: `atlas:${entity.slug}`,
      })),
      ...context.directEncyclopediaEntries.map((entry) => ({
        slug: `encyclopedia:${entry.slug}`,
      })),
    ],
    toc: await buildTocEntries(
      context.worldSchemaStore,
      visible.filter((entity) => !directAtlasIds.has(entity.id))
    ),
  };
};

const isEmpty = (value: unknown): boolean =>
  value === undefined
  || value === null
  || (typeof value === 'string' && value.trim().length === 0)
  || (typeof value === 'object' && value !== null && Object.values(value).every(
    (inner) => inner === undefined || inner === null
  ));

const edgeHandle = (edge: SeedTocEntry['relationships'][number]): string =>
  `${edge.direction === 'out' ? '' : '<-'}${edge.verb}:${edge.targetSlug}`;

/**
 * One entity, one stanza. The index is a menu of what can be opened, so it
 * carries how much there is and edge handles — never field values, and never
 * field names, which a chooser cannot act on and a model will mistake for tool
 * arguments. The generic block renderer would spend a line per relationship
 * field; here the whole edge fits in a handle the retrieval tools take verbatim.
 */
const tocStanza = (entry: SeedTocEntry): string => {
  const heading = [
    `${entry.slug} · ${entry.kind} · ${entry.prominence}`,
    entry.status === undefined ? '' : ` · ${entry.status}`,
    entry.unwritten ? ' · unwritten' : '',
    entry.blurb === undefined ? '' : ` — ${entry.blurb}`,
  ].join('');
  const detail = [
    entry.factKeys.length > 0 ? `${INDENT}facts: ${entry.factKeys.join(', ')}` : '',
    entry.noteCount > 0 ? `${INDENT}notes: ${entry.noteCount}` : '',
    entry.relationships.length > 0
      ? `${INDENT}edges: ${entry.relationships.slice(0, MAX_INDEX_EDGES).map(edgeHandle).join(', ')}`
        + (entry.relationships.length > MAX_INDEX_EDGES
          ? ` (+${entry.relationships.length - MAX_INDEX_EDGES} more via expand)`
          : '')
      : '',
    entry.loreCount > 0 ? `${INDENT}lore: ${entry.loreCount}` : '',
  ].filter((line) => line.length > 0);
  return [heading, ...detail].join('\n');
};

export const renderWorldIndex = (
  toc: SeedTocEntry[],
  encyclopediaToc: EncyclopediaEntrySummary[] = []
): string => [
  ...toc.map(tocStanza),
  ...encyclopediaToc.map((entry) =>
    `${entry.slug} · ${entry.kind}/${entry.subkind} · ${entry.prevalence} — ${entry.summary}`
  ),
].join('\n');

/** One user message: the seed sections, the world index, then the player message. */
export const renderSeedPack = (pack: SeedPack, playerMessage: string): string => {
  const parts: string[] = [];
  for (const section of pack.sections) {
    if (!isEmpty(section.value)) {
      parts.push(`### ${section.name}\n${renderBlock(section.value)}`);
    }
  }
  parts.push(`### WORLD-INDEX\n${renderWorldIndex(pack.toc, pack.encyclopediaToc)}`);
  parts.push(`### PLAYER-MESSAGE\n${playerMessage}`);
  return parts.join('\n\n');
};
