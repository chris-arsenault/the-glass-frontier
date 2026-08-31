import {
  CanonProposal,
  ContextTagDefinition,
  EncyclopediaEntry,
  type CanonProposal as CanonProposalType,
} from '@glass-frontier/dto';
import { z } from 'zod';

import type { TsonuEntry } from './tsonuBundle';

const CONTEXT_SCOPES = ['world', 'place', 'scene', 'participant'] as const;

export type TsonuContextTag = {
  id: string;
  description: string | null;
  scopes: Array<(typeof CONTEXT_SCOPES)[number]>;
  parent?: string | null;
  compatible_with: string[];
};

export type TsonuContextTerm =
  | { scope: (typeof CONTEXT_SCOPES)[number]; tag: string }
  | {
      scope: (typeof CONTEXT_SCOPES)[number];
      encyclopedia_external_key: string;
    };

type TsonuEncyclopediaAtlasRecord = {
  external_key: string;
  title: string;
  kind: string;
  subkind: string;
  route: string;
};

export type TsonuEncyclopediaEntry = {
  external_key: string;
  slug: string;
  title: string;
  aliases: string[];
  kind: string;
  subkind: string;
  status: 'shell' | 'draft' | 'complete';
  summary: string | null;
  topics: string[];
  availability:
    | { mode: 'global' }
    | {
        mode: 'contextual';
        selectors: Array<{
          all: TsonuContextTerm[];
          any: TsonuContextTerm[];
          none: TsonuContextTerm[];
        }>;
      }
    | null;
  prevalence: 'common' | 'uncommon' | 'rare' | null;
  character_role?: 'species' | 'culture' | null;
  origin_blurb?: string | null;
  facts: Record<string, string | number>;
  descriptive_identity: Record<string, string>;
  tiers: Array<{ tier: string; effect: string; cost?: string | null }>;
  usage: {
    cues: string[];
    affordances: string[];
    pressures: string[];
    variations: string[];
  };
  sections: Array<{ heading: string; text: string; audience: 'player' | 'gm' }>;
  instances: TsonuEncyclopediaAtlasRecord[];
  members: TsonuEncyclopediaAtlasRecord[];
  dm: boolean;
};

export type TsonuClassification = {
  encyclopediaExternalKey: string;
  entityExternalKey: string;
  role: 'type' | 'membership';
};

export type TsonuCanonSnapshot = {
  atlas: CanonProposalType;
  classifications: TsonuClassification[];
  contextTags: ContextTagDefinition[];
  encyclopedia: EncyclopediaEntry[];
  revision: string;
  schemaVersion: number;
  sourceId: string;
};

const tsonuContextScope = z.enum(CONTEXT_SCOPES);
const tsonuContextTerm = z.union([
  z.object({ scope: tsonuContextScope, tag: z.string().min(1) }),
  z.object({
    encyclopedia_external_key: z.string().min(1),
    scope: tsonuContextScope,
  }),
]);
const tsonuAtlasRecord = z.object({
  external_key: z.string().min(1),
  kind: z.string().min(1),
  route: z.string().min(1),
  subkind: z.string().min(1),
  title: z.string().min(1),
});

export const TsonuEncyclopediaEntrySchema = z.object({
  aliases: z.array(z.string().min(1)),
  availability: z
    .discriminatedUnion('mode', [
      z.object({ mode: z.literal('global') }),
      z.object({
        mode: z.literal('contextual'),
        selectors: z.array(
          z.object({
            all: z.array(tsonuContextTerm),
            any: z.array(tsonuContextTerm),
            none: z.array(tsonuContextTerm),
          })
        ).min(1),
      }),
    ])
    .nullable(),
  character_role: z.enum(['species', 'culture']).nullish(),
  descriptive_identity: z.record(z.string(), z.string()),
  dm: z.boolean(),
  external_key: z.string().min(1),
  facts: z.record(z.string(), z.union([z.string(), z.number()])),
  instances: z.array(tsonuAtlasRecord),
  kind: z.string().min(1),
  members: z.array(tsonuAtlasRecord),
  origin_blurb: z.string().min(1).nullish(),
  prevalence: z.enum(['common', 'uncommon', 'rare']).nullable(),
  sections: z.array(
    z.object({
      audience: z.enum(['player', 'gm']),
      heading: z.string().min(1),
      text: z.string().min(1),
    })
  ),
  slug: z.string().min(1),
  status: z.enum(['shell', 'draft', 'complete']),
  subkind: z.string().min(1),
  summary: z.string().min(1).nullable(),
  tiers: z.array(
    z.object({
      cost: z.string().min(1).nullish(),
      effect: z.string().min(1),
      tier: z.string().min(1),
    })
  ),
  title: z.string().min(1),
  topics: z.array(z.string().min(1)),
  usage: z.object({
    affordances: z.array(z.string().min(1)),
    cues: z.array(z.string().min(1)),
    pressures: z.array(z.string().min(1)),
    variations: z.array(z.string().min(1)),
  }),
});

export const TsonuContextTagSchema = z.object({
  compatible_with: z.array(z.string().min(1)),
  description: z.string().nullable(),
  id: z.string().min(1),
  parent: z.string().min(1).nullish(),
  scopes: z.array(tsonuContextScope).min(1),
});

export const parseTsonuSnapshot = (input: unknown): TsonuCanonSnapshot => {
  const snapshot = z.object({
    atlas: CanonProposal,
    classifications: z.array(
      z.object({
        encyclopediaExternalKey: z.string().min(1),
        entityExternalKey: z.string().min(1),
        role: z.enum(['type', 'membership']),
      })
    ),
    contextTags: z.array(ContextTagDefinition),
    encyclopedia: z.array(EncyclopediaEntry),
    revision: z.string().min(1),
    schemaVersion: z.number().int().min(13),
    sourceId: z.string().min(1),
  }).parse(input);
  if (snapshot.atlas.sourceId !== snapshot.sourceId) {
    throw new Error('Tsonu snapshot and Atlas proposal source ids differ');
  }
  return snapshot;
};

const tsonuKey = (id: string): string => `tsonu:${id}`;

const buildContextTerm = (term: TsonuContextTerm): unknown =>
  'tag' in term
    ? { scope: term.scope, tag: term.tag, type: 'tag' }
    : {
      encyclopediaExternalKey: term.encyclopedia_external_key,
      scope: term.scope,
      type: 'encyclopedia',
    };

const atlasRecord = (record: TsonuEncyclopediaAtlasRecord): {
  kind: string;
  slug: string;
  subkind: string;
  title: string;
} => ({
  kind: record.kind,
  slug: `atlas:${record.route.split('/').filter(Boolean).at(-1) ?? record.external_key}`,
  subkind: record.subkind,
  title: record.title,
});

const buildEncyclopediaEntry = (entry: TsonuEncyclopediaEntry): EncyclopediaEntry =>
  EncyclopediaEntry.parse({
    aliases: entry.aliases,
    availability:
      entry.availability === null
        ? undefined
        : entry.availability.mode === 'global'
          ? entry.availability
          : {
            mode: 'contextual',
            selectors: entry.availability.selectors.map((selector) => ({
              all: selector.all.map(buildContextTerm),
              any: selector.any.map(buildContextTerm),
              none: selector.none.map(buildContextTerm),
            })),
          },
    characterRole: entry.character_role ?? undefined,
    descriptiveIdentity: entry.descriptive_identity,
    dm: entry.dm,
    externalKey: entry.external_key,
    facts: entry.facts,
    instances: entry.instances.map(atlasRecord),
    kind: entry.kind,
    members: entry.members.map(atlasRecord),
    originBlurb: entry.origin_blurb ?? undefined,
    prevalence: entry.prevalence ?? undefined,
    sections: entry.sections,
    slug: entry.slug,
    status: entry.status,
    subkind: entry.subkind,
    summary: entry.summary ?? undefined,
    tiers: entry.tiers.map((tier) => ({
      cost: tier.cost ?? undefined,
      effect: tier.effect,
      tier: tier.tier,
    })),
    title: entry.title,
    topics: entry.topics,
    usage: entry.usage,
  });

const buildClassifications = (
  entries: TsonuEntry[],
  encyclopedia: EncyclopediaEntry[]
): TsonuClassification[] => {
  const encyclopediaByKey = new Map(encyclopedia.map((entry) => [entry.externalKey, entry]));
  return entries.flatMap((entry) => {
    const classifications: TsonuClassification[] = [];
    if (entry.encyclopedia_type !== null && entry.encyclopedia_type !== undefined) {
      if (!encyclopediaByKey.has(entry.encyclopedia_type)) {
        throw new Error(
          `Tsonu entry ${entry.id} has unknown Encyclopedia type ${entry.encyclopedia_type}`
        );
      }
      classifications.push({
        encyclopediaExternalKey: entry.encyclopedia_type,
        entityExternalKey: tsonuKey(entry.id),
        role: 'type',
      });
    }
    for (const membership of entry.encyclopedia_memberships) {
      const target = encyclopediaByKey.get(membership.external_key);
      if (target === undefined) {
        throw new Error(
          `Tsonu entry ${entry.id} has unknown Encyclopedia membership ${membership.external_key}`
        );
      }
      if (target.kind !== membership.kind) {
        throw new Error(
          `Tsonu entry ${entry.id} declares ${membership.external_key} as ${membership.kind}, `
          + `but the Encyclopedia entry is ${target.kind}`
        );
      }
      classifications.push({
        encyclopediaExternalKey: membership.external_key,
        entityExternalKey: tsonuKey(entry.id),
        role: 'membership',
      });
    }
    return classifications;
  });
};

export const buildTsonuEncyclopedia = (input: {
  contextTags: TsonuContextTag[];
  encyclopedia: TsonuEncyclopediaEntry[];
  entries: TsonuEntry[];
}): Pick<TsonuCanonSnapshot, 'classifications' | 'contextTags' | 'encyclopedia'> => {
  const encyclopedia = input.encyclopedia
    .map(buildEncyclopediaEntry)
    .sort((a, b) => a.externalKey.localeCompare(b.externalKey));
  const contextTags = input.contextTags
    .map((tag) =>
      ContextTagDefinition.parse({
        compatibleWith: tag.compatible_with,
        description: tag.description,
        id: tag.id,
        parent: tag.parent ?? undefined,
        scopes: tag.scopes,
      })
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    classifications: buildClassifications(input.entries, encyclopedia),
    contextTags,
    encyclopedia,
  };
};
