import type { Chronicle, HardStateProminence, Turn } from '@glass-frontier/dto';
import {
  HardStateKind,
  HardStateSubkind,
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
  subkind: HardStateSubkind.nullable().optional(),
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

/**
 * One thing the closure decided not to keep, and why. Collected at every
 * filtering stage and logged whole, so a missing entity or edge in the world
 * graph can be traced to "dropped here for this reason" or "never proposed".
 */
export type CanonDrop = {
  reason: string;
  stage: 'known_lore' | 'new_entity' | 'relationship';
  subject: string;
};

export type RosterEntry = {
  centralCount: number;
  gmReferenceCount: number;
  id: string;
  kind: string;
  mentionedCount: number;
  name: string;
  playerReferenceCount: number;
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

const collectRosterEntries = (
  turns: Turn[]
): Map<string, { kind: string; name: string; slug: string }> => {
  const roster = new Map<string, { kind: string; name: string; slug: string }>();
  for (const turn of turns) {
    for (const entity of turn.entityRoster ?? []) {
      roster.set(entity.id, { kind: entity.kind, name: entity.name, slug: entity.slug });
    }
  }
  return roster;
};

const ensureRosterEntry = (
  entries: Map<string, RosterEntry>,
  identities: Map<string, { kind: string; name: string; slug: string }>,
  entityId: string
): RosterEntry | null => {
  const identity = identities.get(entityId);
  if (identity === undefined) {
    return null;
  }
  const entry = entries.get(entityId) ?? {
    centralCount: 0,
    gmReferenceCount: 0,
    id: entityId,
    kind: identity.kind,
    mentionedCount: 0,
    name: identity.name,
    playerReferenceCount: 0,
    slug: identity.slug,
  };
  entries.set(entityId, entry);
  return entry;
};

const recordReferences = (
  entries: Map<string, RosterEntry>,
  identities: Map<string, { kind: string; name: string; slug: string }>,
  turn: Turn
): void => {
  for (const reference of turn.entityReferences ?? []) {
    const entry = ensureRosterEntry(entries, identities, reference.entityId);
    if (entry === null) {
      continue;
    }
    if (reference.speaker === 'player') {
      entry.playerReferenceCount += 1;
    } else {
      entry.gmReferenceCount += 1;
    }
  }
};

const recordUsage = (entries: Map<string, RosterEntry>, turn: Turn): void => {
  for (const usage of turn.entityUsage ?? []) {
    const entry = entries.get(usage.entityId);
    if (entry === undefined) {
      continue;
    }
    if (usage.usage === 'central') {
      entry.centralCount += 1;
    } else if (usage.usage === 'mentioned') {
      entry.mentionedCount += 1;
    }
  }
};

const compareRosterEntries = (left: RosterEntry, right: RosterEntry): number => {
  const comparisons = [
    right.centralCount - left.centralCount,
    right.playerReferenceCount - left.playerReferenceCount,
    right.gmReferenceCount - left.gmReferenceCount,
    right.mentionedCount - left.mentionedCount,
  ];
  return comparisons.find((comparison) => comparison !== 0) ?? 0;
};

/**
 * Established canon entities that player or GM transcript text actually
 * referenced. The per-turn public roster supplies stable identity without a
 * canon read; entities that were merely displayed never enter closure review.
 */
export const buildRoster = (turns: Turn[]): RosterEntry[] => {
  const identities = collectRosterEntries(turns);
  const entries = new Map<string, RosterEntry>();
  for (const turn of turns) {
    recordReferences(entries, identities, turn);
    recordUsage(entries, turn);
  }
  return [...entries.values()].sort(compareRosterEntries);
};

/**
 * Roster entities that were central at least once may receive closure lore —
 * as may any entity a scene revolved around, central or not: being a scene
 * subject is significance by construction.
 */
export const isEligibleForLore = (
  entry: RosterEntry,
  sceneSubjects: ReadonlySet<string>
): boolean => entry.centralCount >= 1 || sceneSubjects.has(entry.name.trim().toLowerCase());

export type SceneSummary = {
  firstTurn: number;
  lastTurn: number;
  outcome: 'complete' | 'continue';
  subject: string;
  subjectKind: string;
  type: string;
};

/**
 * One entry per scene the chronicle played through, in order: the subject the
 * scene revolved around, its final outcome, and the turn span. A scene still
 * open at closure (the chronicle's activeScene) is included as `continue`.
 */
export const collectScenes = (
  turns: Turn[],
  activeScene: Chronicle['activeScene']
): SceneSummary[] => {
  const scenes = new Map<string, SceneSummary>();
  const ordered = [...turns].sort((a, b) => a.turnSequence - b.turnSequence);
  for (const turn of ordered) {
    const context = turn.sceneContext;
    if (context === undefined || context === null) {
      continue;
    }
    const existing = scenes.get(context.sceneId);
    if (existing === undefined) {
      scenes.set(context.sceneId, {
        firstTurn: turn.turnSequence,
        lastTurn: turn.turnSequence,
        outcome: context.outcome,
        subject: context.subject,
        subjectKind: context.subjectKind,
        type: context.type,
      });
    } else {
      existing.lastTurn = turn.turnSequence;
      existing.outcome = context.outcome;
    }
  }
  if (activeScene !== null && activeScene !== undefined && !scenes.has(activeScene.id)) {
    scenes.set(activeScene.id, {
      firstTurn: activeScene.startedAtTurn,
      lastTurn: activeScene.startedAtTurn,
      outcome: 'continue',
      subject: activeScene.subject,
      subjectKind: activeScene.subjectKind,
      type: activeScene.type,
    });
  }
  return [...scenes.values()].sort((a, b) => a.firstTurn - b.firstTurn);
};

export const sceneSubjectNames = (scenes: SceneSummary[]): ReadonlySet<string> =>
  new Set(scenes.map((scene) => scene.subject.trim().toLowerCase()));

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

const toCandidate = (
  proposed: NewEntityProposal,
  name: string,
  drops: CanonDrop[]
): SanitizedNewEntity => {
  const loreTags = sanitizeTags(proposed.loreTags);
  const removedTags = (proposed.loreTags ?? []).filter((tag) => !loreTags.includes(tag));
  if (removedTags.length > 0) {
    drops.push({
      reason: `invalid_tags_removed: ${removedTags.join(', ')}`,
      stage: 'new_entity',
      subject: name,
    });
  }
  const subkind = sanitizeSubkind(proposed.kind, proposed.subkind);
  if (proposed.subkind !== undefined && proposed.subkind !== null && subkind === undefined) {
    drops.push({
      reason: `invalid_subkind_removed: ${proposed.subkind} (kind ${proposed.kind})`,
      stage: 'new_entity',
      subject: name,
    });
  }
  return {
    isLocation: proposed.isLocation,
    kind: proposed.kind,
    loreProse: proposed.loreProse.trim(),
    loreTags,
    loreTitle: proposed.loreTitle.trim(),
    name,
    relationships: proposed.relationships ?? [],
    subkind,
  };
};

const collectCandidates = (input: {
  cap: number;
  drops: CanonDrop[];
  proposals: NewEntityProposal[];
  recordKnown: (roster: RosterEntry, entry: Omit<KnownEntityLore, 'slug'>) => string | null;
  rosterByName: Map<string, RosterEntry>;
}): SanitizedNewEntity[] => {
  const { cap, drops, proposals, recordKnown, rosterByName } = input;
  const candidates: SanitizedNewEntity[] = [];
  const seenNames = new Set<string>();
  for (const proposed of proposals) {
    const name = proposed.name.trim();
    const lower = name.toLowerCase();
    if (name.length === 0) {
      drops.push({ reason: 'empty_name', stage: 'new_entity', subject: proposed.name });
      continue;
    }
    if (seenNames.has(lower)) {
      drops.push({ reason: 'duplicate_name', stage: 'new_entity', subject: name });
      continue;
    }
    seenNames.add(lower);
    const rosterEntry = rosterByName.get(lower);
    if (rosterEntry !== undefined) {
      const refusal = recordKnown(rosterEntry, proposed);
      if (refusal !== null) {
        drops.push({
          reason: `roster_name_remap_refused: ${refusal}`,
          stage: 'new_entity',
          subject: name,
        });
      }
      continue;
    }
    if (candidates.length >= cap) {
      drops.push({ reason: `over_cap: ${cap}`, stage: 'new_entity', subject: name });
      continue;
    }
    candidates.push(toCandidate(proposed, name, drops));
  }
  return candidates;
};

const recordKnownEntities = (
  entries: KnownEntityLore[],
  rosterBySlug: Map<string, RosterEntry>,
  recordKnown: (roster: RosterEntry, entry: Omit<KnownEntityLore, 'slug'>) => string | null,
  drops: CanonDrop[]
): void => {
  for (const entry of entries) {
    const rosterEntry = rosterBySlug.get(entry.slug);
    if (rosterEntry === undefined) {
      drops.push({ reason: 'unknown_roster_slug', stage: 'known_lore', subject: entry.slug });
      continue;
    }
    const refusal = recordKnown(rosterEntry, entry);
    if (refusal !== null) {
      drops.push({ reason: refusal, stage: 'known_lore', subject: entry.slug });
    }
  }
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
  cap: number,
  sceneSubjects: ReadonlySet<string> = new Set()
): { candidates: SanitizedNewEntity[]; drops: CanonDrop[]; knownLore: SanitizedKnownLore[] } => {
  const rosterByName = new Map(roster.map((entry) => [entry.name.toLowerCase(), entry]));
  const rosterBySlug = new Map(roster.map((entry) => [entry.slug, entry]));
  const knownBySlug = new Map<string, SanitizedKnownLore>();
  const drops: CanonDrop[] = [];

  const recordKnown = (
    rosterEntry: RosterEntry,
    entry: Omit<KnownEntityLore, 'slug'>
  ): string | null => {
    if (!isEligibleForLore(rosterEntry, sceneSubjects)) {
      return 'not_eligible_for_lore';
    }
    if (knownBySlug.has(rosterEntry.slug)) {
      return 'duplicate_lore_for_slug';
    }
    knownBySlug.set(rosterEntry.slug, {
      loreProse: entry.loreProse.trim(),
      loreTags: sanitizeTags(entry.loreTags),
      loreTitle: entry.loreTitle.trim(),
      relationships: entry.relationships ?? [],
      roster: rosterEntry,
    });
    return null;
  };

  recordKnownEntities(extraction.knownEntities, rosterBySlug, recordKnown, drops);
  const candidates = collectCandidates({
    cap,
    drops,
    proposals: extraction.newEntities,
    recordKnown,
    rosterByName,
  });

  return { candidates, drops, knownLore: [...knownBySlug.values()] };
};
