import type {
  HardState,
  HardStateKind,
  HardStateProminence,
  HardStateStatus,
} from '@glass-frontier/dto';
import { isNonEmptyString } from '@glass-frontier/utils';

import type { ChronicleFragmentTypes } from '../prompts/chronicleFragments';
import { extractFragment } from '../prompts/chronicleFragments';
import type { GraphContext } from '../types';

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
  seedEntities: Array<{ id: string; slug: string }>;
  toc: SeedTocEntry[];
};

const MAX_SEED_ENTITIES = 12;

/** The fragments the seed pack shares with the one-shot prompt, by section name. */
const SHARED_SECTIONS: Array<{ name: string; fragment: ChronicleFragmentTypes }> = [
  { fragment: 'recent-events', name: 'RECENT-EVENTS' },
  { fragment: 'tone', name: 'TONE' },
  { fragment: 'chronicle-tone', name: 'CHRONICLE-TONE' },
  { fragment: 'intent', name: 'INTENT' },
  { fragment: 'scene', name: 'SCENE' },
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

/** Seed collection is deliberately one small function; iterate here. */
export const collectSeedIds = async (context: GraphContext): Promise<string[]> => {
  const chronicle = context.chronicleState.chronicle;
  const location = await context.worldSchemaStore.findLocationByName({
    name: context.chronicleState.locationName,
  });
  const candidates = [
    ...(chronicle.entityRoster?.entries ?? []).map((entry) => entry.id),
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

const renderValue = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value);

const isEmpty = (value: unknown): boolean =>
  value === undefined
  || value === null
  || (typeof value === 'string' && value.trim().length === 0)
  || (typeof value === 'object' && value !== null && Object.values(value).every(
    (inner) => inner === undefined || inner === null
  ));

/** One user message: the seed sections, the world index, then the player message. */
export const renderSeedPack = (pack: SeedPack, playerMessage: string): string => {
  const parts: string[] = [];
  for (const section of pack.sections) {
    if (!isEmpty(section.value)) {
      parts.push(`### ${section.name}\n${renderValue(section.value)}`);
    }
  }
  parts.push(`### WORLD-INDEX\n${JSON.stringify(pack.toc)}`);
  parts.push(`### PLAYER-MESSAGE\n${playerMessage}`);
  return parts.join('\n\n');
};
