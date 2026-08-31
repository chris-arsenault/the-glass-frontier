import type { Character, HardState, LoreFragment, Skill } from '@glass-frontier/dto';

/**
 * The canonical way canon and characters are shown to a model.
 *
 * Two assemblies used to exist. The GM pipeline's had been trimmed repeatedly —
 * ids stripped, lore capped, Atlas markdown removed, line-rendered — while the
 * chronicle seed and opening kept their own, which shipped raw JSON with the
 * character's origin as four uuids, five whole lore fragments carrying the same
 * five tags five times, and `[Lowbank](/glass-frontier/entry/lowbank)` links
 * into the prompt. Every fix to one missed the other. There is one now, and it
 * lives here because both services already depend on this package for the
 * prompt templates themselves.
 */

const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]*\)/gu;

/**
 * Canon prose is authored for the Atlas and carries links back into the app.
 * The model wants the name, not the route.
 */
export const plainProse = (text: string | undefined): string | undefined =>
  text === undefined ? undefined : text.replaceAll(MARKDOWN_LINK, '$1');

const firstSentence = (text: string): string => {
  const period = text.indexOf('. ');
  return period === -1 ? text : text.slice(0, period + 1);
};

export type EntityView = {
  description: string | undefined;
  descriptiveIdentity: Record<string, string | undefined> | undefined;
  facts: Record<string, string | number>;
  gmNotes: Array<{ kind: string; text: string | undefined }>;
  kind: string;
  lore: Array<{ summary: string; title: string }>;
  name: string;
  slug: string;
  status: string | undefined;
  subkind: string | undefined;
};

export type EntityViewOptions = {
  /** How many lore fragments to carry. */
  loreLimit?: number;
  /** How many GM notes to carry. */
  noteLimit?: number;
  /** Whole fragments instead of first sentences, for the few readers that need them. */
  fullLore?: boolean;
};

/**
 * The composed prose the canon publishes under stable keys — `setting`,
 * `activity`, `hazards`, `appearance`, `manner`. It is the summary layer the
 * prompts were missing: for Dovra it is 1,053 characters against 5,029 of lore,
 * and it answers what a scene needs without the reader assembling it.
 */
export const identityView = (
  identity: Record<string, string> | undefined
): Record<string, string | undefined> | undefined => {
  if (identity === undefined) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(identity).map(([key, text]) => [key, plainProse(text)])
  );
};

/**
 * One entity as a model should see it: what it is, the answers a reader expects
 * up front, how to run it, and enough lore to place it — summarized by default,
 * because a reader needs the shape of a fact more often than its full text.
 */
export const entityView = (
  entity: HardState,
  lore: LoreFragment[],
  options: EntityViewOptions = {}
): EntityView => ({
  description: plainProse(entity.description),
  descriptiveIdentity: identityView(entity.descriptiveIdentity),
  facts: entity.facts,
  gmNotes: (entity.gmNotes ?? []).slice(0, options.noteLimit ?? 2).map((note) => ({
    kind: note.kind,
    text: plainProse(note.text),
  })),
  kind: entity.kind,
  lore: lore.slice(0, options.loreLimit ?? 3).map((fragment) => ({
    summary: plainProse(
      options.fullLore === true ? fragment.prose : firstSentence(fragment.prose)
    ) ?? '',
    title: fragment.title,
  })),
  name: entity.name,
  slug: entity.slug,
  status: entity.status,
  subkind: entity.subkind,
});

export type OriginNames = {
  allegiance?: string;
  culture?: string;
  homeland?: string;
  species?: string;
};

const trimSkills = (skills: Skill[]): Array<{
  attribute: string;
  name: string;
  tier: string;
}> => skills.map((skill) => ({
  attribute: skill.attribute,
  name: skill.name,
  tier: skill.tier,
}));

/**
 * The character sheet without the bookkeeping. Origin arrives as names — the
 * caller resolves the ids, because only it knows which store to ask — and the
 * record's own id, the player id, and per-skill xp never reach a model that
 * cannot do anything with them.
 */
export const characterView = (
  character: Character,
  originNames: OriginNames
): Record<string, unknown> => ({
  archetype: character.archetype,
  attributes: character.attributes,
  bio: character.bio,
  callings: character.nature.callings,
  drive: character.nature.drive,
  flaw: character.nature.flaw,
  instinct: character.nature.instinct,
  name: character.name,
  origin: {
    allegiance: originNames.allegiance,
    allegianceStance: character.origin.allegianceStance,
    culture: originNames.culture,
    homeland: originNames.homeland,
    species: originNames.species,
  },
  pronouns: character.pronouns,
  skills: trimSkills(Object.values(character.skills)),
  uniqueThing: character.nature.uniqueThing,
});

/** Atlas ids a caller must resolve to fill `OriginNames`. */
export const originAtlasEntityIds = (character: Character): string[] => [
  character.origin.homelandId,
  character.origin.allegianceId,
];

/** Encyclopedia ids a caller must resolve to fill `OriginNames`. */
export const originEncyclopediaIds = (character: Character): string[] => [
  character.origin.speciesReferenceId,
  character.origin.cultureReferenceId,
];

/** Names keyed by id, as the resolving caller gets them back from a store. */
export const originNamesFrom = (
  character: Character,
  names: Map<string, string>
): OriginNames => ({
  allegiance: names.get(character.origin.allegianceId),
  culture: names.get(character.origin.cultureReferenceId),
  homeland: names.get(character.origin.homelandId),
  species: names.get(character.origin.speciesReferenceId),
});
