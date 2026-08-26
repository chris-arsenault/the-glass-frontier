import type {
  HardState,
  HardStateKind,
  HardStateProminence,
  HardStateStatus,
} from '@glass-frontier/dto';
import { isNonEmptyString } from '@glass-frontier/utils';

import { renderBlock } from '../prompts/blockRender';
import type { ChronicleFragmentTypes } from '../prompts/chronicleFragments';
import { extractFragment } from '../prompts/chronicleFragments';
import type { GraphContext } from '../types';
import type { ServedEntity } from './toolSession';

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
  identityKeys: string[];
  factKeys: string[];
  relationships: Array<{
    verb: string;
    direction: 'out' | 'in';
    targetSlug: string;
    targetName: string;
    identityKeys: string[];
  }>;
  loreCount: number;
};

export type SeedPack = {
  sections: Array<{ name: string; value: unknown }>;
  seedEntities: ServedEntity[];
  toc: SeedTocEntry[];
};

const MAX_SEED_ENTITIES = 6;
/** bloom_zones printed 21 edges into a hunting turn; a menu is not a database. */
const MAX_INDEX_EDGES = 6;

/** The fragments the seed pack shares with the one-shot prompt, by section name. */
const SHARED_SECTIONS: Array<{ name: string; fragment: ChronicleFragmentTypes }> = [
  { fragment: 'recent-events', name: 'RECENT-EVENTS' },
  { fragment: 'tone', name: 'TONE' },
  { fragment: 'chronicle-tone', name: 'CHRONICLE-TONE' },
  { fragment: 'intent', name: 'INTENT' },
  { fragment: 'scene', name: 'SCENE' },
  { fragment: 'fronts', name: 'FRONTS' },
  { fragment: 'ledger', name: 'LEDGER' },
  { fragment: 'entity-references', name: 'PLAYER-REFERENCES' },
  { fragment: 'character', name: 'CHARACTER' },
  { fragment: 'skill-check', name: 'SKILL-CHECK' },
  { fragment: 'location', name: 'LOCATION' },
  { fragment: 'inventory-detail', name: 'INVENTORY-DETAIL' },
  { fragment: 'wrap', name: 'WRAP' },
  { fragment: 'seed', name: 'SEED' },
];

const firstSentence = (text: string | undefined): string | undefined => {
  if (!isNonEmptyString(text)) {
    return undefined;
  }
  const period = text.indexOf('. ');
  return period === -1 ? text : text.slice(0, period + 1);
};

/**
 * Only what this turn actually touches.
 *
 * The index used to open with the curated roster — seven entities chosen by a
 * scorer before anyone knew what the turn was about — and a chronicle about
 * hunting animals in a gas giant carried a pilgrim bead, a Tuner guild, and a
 * region of orbital reality tears for its whole run. The roster is gone: what
 * seeds the index is the place, the anchor, the scene's subject, and whatever
 * the player or the scene named. Everything else is the scout's to discover
 * with `search`, which is the entire point of giving it tools.
 */
export const collectSeedIds = async (context: GraphContext): Promise<string[]> => {
  const chronicle = context.chronicleState.chronicle;
  const location = await context.worldSchemaStore.findLocationByName({
    name: context.chronicleState.locationName,
  });
  const candidates = [
    chronicle.anchorEntityId,
    context.effectiveScene?.subjectEntityId,
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
  identityKeys: Object.keys(entity.descriptiveIdentity ?? {}),
  kind: entity.kind,
  loreCount,
  name: entity.name,
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
        identityKeys: Object.keys(link.descriptiveIdentity ?? {}),
        targetName: target.name,
        targetSlug: target.slug,
        verb: link.relationship,
      }];
    }),
  slug: entity.slug,
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

export const buildSeedPack = async (context: GraphContext): Promise<SeedPack> => {
  const seedEntityIds = await collectSeedIds(context);
  const [entities, sectionValues] = await Promise.all([
    context.worldSchemaStore.listEntitiesByIds(seedEntityIds),
    Promise.all(
      SHARED_SECTIONS.map(async ({ fragment, name }) => ({
        name,
        value: await extractFragment(fragment, context),
      }))
    ),
  ]);
  const visible = entities.filter((entity) => !entity.dm);
  return {
    sections: sectionValues,
    seedEntities: visible.map((entity) => ({ id: entity.id, slug: entity.slug })),
    toc: await buildTocEntries(context.worldSchemaStore, visible),
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
 * carries field *names* and edge handles — never field values. The generic
 * block renderer would spend a line per relationship field; here the whole
 * edge fits in a handle the retrieval tools accept verbatim.
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
    entry.identityKeys.length > 0 ? `${INDENT}identity: ${entry.identityKeys.join(', ')}` : '',
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

export const renderWorldIndex = (toc: SeedTocEntry[]): string =>
  toc.map(tocStanza).join('\n');

/** One user message: the seed sections, the world index, then the player message. */
export const renderSeedPack = (pack: SeedPack, playerMessage: string): string => {
  const parts: string[] = [];
  for (const section of pack.sections) {
    if (!isEmpty(section.value)) {
      parts.push(`### ${section.name}\n${renderBlock(section.value)}`);
    }
  }
  parts.push(`### WORLD-INDEX\n${renderWorldIndex(pack.toc)}`);
  parts.push(`### PLAYER-MESSAGE\n${playerMessage}`);
  return parts.join('\n\n');
};
