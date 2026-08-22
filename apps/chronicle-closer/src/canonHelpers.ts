import type { HardStateProminence, Turn } from '@glass-frontier/dto';
import {
  HardStateKind,
  WORLD_TAG_IDS,
  WRITABLE_RELATIONSHIP_TYPES,
  getWorldKind,
} from '@glass-frontier/dto';
import { z } from 'zod';

const WRITABLE_VERB_IDS = WRITABLE_RELATIONSHIP_TYPES.map((type) => type.id) as [
  string,
  ...string[],
];

const RelationshipProposalSchema = z.object({
  relationship: z.enum(WRITABLE_VERB_IDS).describe('A verb from the provided relationship list'),
  target: z
    .string()
    .min(1)
    .describe('A roster slug or the exact name of a new entity in this response'),
});

const NewEntityProposalSchema = z.object({
  isLocation: z.boolean().describe('True only when this entity is a place characters can be at'),
  kind: HardStateKind,
  loreProse: z.string().min(1).describe('What happened involving this entity, past tense'),
  loreTags: z.array(z.string()).nullable().optional(),
  loreTitle: z.string().min(1),
  name: z.string().min(1).describe('The proper name used in the story'),
  relationships: z.array(RelationshipProposalSchema).nullable().optional(),
  subkind: z.string().nullable().optional(),
});

const KnownEntityLoreSchema = z.object({
  loreProse: z.string().min(1).describe('What happened to this entity, past tense'),
  loreTags: z.array(z.string()).nullable().optional(),
  loreTitle: z.string().min(1),
  relationships: z.array(RelationshipProposalSchema).nullable().optional(),
  slug: z.string().min(1).describe('The exact roster slug'),
});

export const CanonExtractionSchema = z.object({
  knownEntities: z.array(KnownEntityLoreSchema),
  newEntities: z.array(NewEntityProposalSchema),
});

export type CanonExtraction = z.infer<typeof CanonExtractionSchema>;
export type NewEntityProposal = z.infer<typeof NewEntityProposalSchema>;
export type KnownEntityLore = z.infer<typeof KnownEntityLoreSchema>;
export type RelationshipProposal = z.infer<typeof RelationshipProposalSchema>;

export const CanonResolutionSchema = z.object({
  resolutions: z.array(
    z.object({
      action: z.enum(['create', 'merge']),
      mergeSlug: z.string().nullable().optional(),
      name: z.string().min(1).describe('The candidate name, copied exactly'),
    })
  ),
});

export type CanonResolution = z.infer<typeof CanonResolutionSchema>;

export type RosterEntry = {
  centralCount: number;
  id: string;
  kind: string;
  mentionedCount: number;
  name: string;
  slug: string;
};

const MIN_NEW_ENTITIES = 3;
const MAX_NEW_ENTITIES = 20;
const TURNS_PER_NEW_ENTITY = 5;

/** Longer chronicles earn more new entities: one per five turns, within [3, 20]. */
export const newEntityCap = (turnCount: number): number =>
  Math.min(
    MAX_NEW_ENTITIES,
    Math.max(MIN_NEW_ENTITIES, Math.floor(turnCount / TURNS_PER_NEW_ENTITY))
  );

const PROMINENCE_ORDER: HardStateProminence[] = [
  'forgotten',
  'marginal',
  'recognized',
  'renowned',
  'mythic',
];

/**
 * Prominence a play-born entity has earned from what has accumulated on it.
 * Promotion only — closure never demotes — and `mythic` is never automatic.
 */
export const derivedProminence = (
  current: HardStateProminence,
  loreCount: number,
  edgeCount: number
): HardStateProminence => {
  const earned: HardStateProminence =
    loreCount >= 8 || edgeCount >= 15
      ? 'renowned'
      : loreCount >= 3 || edgeCount >= 5
        ? 'recognized'
        : 'marginal';
  return PROMINENCE_ORDER.indexOf(earned) > PROMINENCE_ORDER.indexOf(current) ? earned : current;
};

const collectOfferedSnippets = (
  turns: Turn[]
): Map<string, { kind: string; name: string; slug: string }> => {
  const offered = new Map<string, { kind: string; name: string; slug: string }>();
  for (const turn of turns) {
    for (const snippet of turn.entityOffered ?? []) {
      offered.set(snippet.id, { kind: snippet.kind, name: snippet.name, slug: snippet.slug });
    }
  }
  return offered;
};

const recordUsage = (
  entries: Map<string, RosterEntry>,
  offered: Map<string, { kind: string; name: string; slug: string }>,
  usage: NonNullable<Turn['entityUsage']>[number]
): void => {
  const snippet = offered.get(usage.entityId);
  if (usage.usage === 'unused' || snippet === undefined) {
    return;
  }
  const entry = entries.get(usage.entityId) ?? {
    centralCount: 0,
    id: usage.entityId,
    kind: snippet.kind,
    mentionedCount: 0,
    name: snippet.name,
    slug: snippet.slug,
  };
  if (usage.usage === 'central') {
    entry.centralCount += 1;
  } else {
    entry.mentionedCount += 1;
  }
  entries.set(usage.entityId, entry);
};

/**
 * The canon entities that appeared during play, ranked by how central they
 * were. Names and kinds come from the offered snippets persisted on each turn,
 * so the roster needs no canon reads.
 */
export const buildRoster = (turns: Turn[]): RosterEntry[] => {
  const offered = collectOfferedSnippets(turns);
  const entries = new Map<string, RosterEntry>();
  for (const turn of turns) {
    for (const usage of turn.entityUsage ?? []) {
      recordUsage(entries, offered, usage);
    }
  }
  return [...entries.values()].sort((a, b) =>
    b.centralCount === a.centralCount
      ? b.mentionedCount - a.mentionedCount
      : b.centralCount - a.centralCount
  );
};

/** Roster entities that were central at least once may receive closure lore. */
export const isEligibleForLore = (entry: RosterEntry): boolean => entry.centralCount >= 1;

const sanitizeTags = (tags: string[] | null | undefined): string[] =>
  (tags ?? []).filter((tag) => WORLD_TAG_IDS.has(tag)).slice(0, 3);

const sanitizeSubkind = (kind: string, subkind: string | null | undefined): string | undefined => {
  if (subkind === undefined || subkind === null) {
    return undefined;
  }
  const kindDef = getWorldKind(kind);
  return kindDef !== undefined && (kindDef.subkinds as readonly string[]).includes(subkind)
    ? subkind
    : undefined;
};

export type SanitizedNewEntity = {
  isLocation: boolean;
  kind: string;
  loreProse: string;
  loreTags: string[];
  loreTitle: string;
  name: string;
  relationships: RelationshipProposal[];
  subkind: string | undefined;
};

export type SanitizedKnownLore = {
  loreProse: string;
  loreTags: string[];
  loreTitle: string;
  relationships: RelationshipProposal[];
  roster: RosterEntry;
};

const toCandidate = (proposed: NewEntityProposal, name: string): SanitizedNewEntity => ({
  isLocation: proposed.isLocation,
  kind: proposed.kind,
  loreProse: proposed.loreProse.trim(),
  loreTags: sanitizeTags(proposed.loreTags),
  loreTitle: proposed.loreTitle.trim(),
  name,
  relationships: proposed.relationships ?? [],
  subkind: sanitizeSubkind(proposed.kind, proposed.subkind),
});

const collectCandidates = (
  proposals: NewEntityProposal[],
  rosterByName: Map<string, RosterEntry>,
  cap: number,
  recordKnown: (roster: RosterEntry, entry: Omit<KnownEntityLore, 'slug'>) => void
): SanitizedNewEntity[] => {
  const candidates: SanitizedNewEntity[] = [];
  const seenNames = new Set<string>();
  for (const proposed of proposals) {
    const name = proposed.name.trim();
    const lower = name.toLowerCase();
    if (name.length === 0 || seenNames.has(lower)) {
      continue;
    }
    seenNames.add(lower);
    const rosterEntry = rosterByName.get(lower);
    if (rosterEntry !== undefined) {
      recordKnown(rosterEntry, proposed);
      continue;
    }
    if (candidates.length < cap) {
      candidates.push(toCandidate(proposed, name));
    }
  }
  return candidates;
};

/**
 * Cleans the extraction: caps and dedupes new entities, remaps a "new" entity
 * that shares a roster name into lore on the known entity, drops subkinds that
 * do not belong to their kind and tags outside the closed vocabulary, and
 * keeps known-entity lore only for eligible roster members.
 */
export const sanitizeExtraction = (
  extraction: CanonExtraction,
  roster: RosterEntry[],
  cap: number
): { candidates: SanitizedNewEntity[]; knownLore: SanitizedKnownLore[] } => {
  const rosterByName = new Map(roster.map((entry) => [entry.name.toLowerCase(), entry]));
  const rosterBySlug = new Map(roster.map((entry) => [entry.slug, entry]));
  const knownBySlug = new Map<string, SanitizedKnownLore>();

  const recordKnown = (rosterEntry: RosterEntry, entry: Omit<KnownEntityLore, 'slug'>): void => {
    if (!isEligibleForLore(rosterEntry) || knownBySlug.has(rosterEntry.slug)) {
      return;
    }
    knownBySlug.set(rosterEntry.slug, {
      loreProse: entry.loreProse.trim(),
      loreTags: sanitizeTags(entry.loreTags),
      loreTitle: entry.loreTitle.trim(),
      relationships: entry.relationships ?? [],
      roster: rosterEntry,
    });
  };

  for (const entry of extraction.knownEntities) {
    const rosterEntry = rosterBySlug.get(entry.slug);
    if (rosterEntry !== undefined) {
      recordKnown(rosterEntry, entry);
    }
  }
  const candidates = collectCandidates(extraction.newEntities, rosterByName, cap, recordKnown);

  return { candidates, knownLore: [...knownBySlug.values()] };
};
