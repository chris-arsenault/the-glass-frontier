import { z } from 'zod';

import { CharacterNature, CharacterOrigin } from './Character';
import {
  Attribute,
  ATTRIBUTE_MODIFIER_LOOKUP,
  CharacterAttributes,
  MOMENTUM_CEILING,
  MOMENTUM_FLOOR,
  type MomentumState,
  skillKey,
  SKILL_MODIFIER_LOOKUP,
} from './mechanics';

/**
 * The character creation budget.
 *
 * Creation is deliberately narrower than the full tier range: a new character
 * spends a fixed set of picks rather than choosing freely, so every sheet
 * starts at the same power level. `transcendent` attributes and the `fool`,
 * `virtuoso` and `legend` skill tiers exist only through play.
 */

/** Attribute tiers a player may pick during creation. */
export const CreationAttributeTier = z.enum([
  'rudimentary',
  'standard',
  'advanced',
  'superior',
]);
export type CreationAttributeTier = z.infer<typeof CreationAttributeTier>;

/** Skill tiers a player may pick during creation. */
export const CreationSkillTier = z.enum(['apprentice', 'artisan']);
export type CreationSkillTier = z.infer<typeof CreationSkillTier>;

/** Attributes raised to `advanced`. */
export const CREATION_ADVANCED_COUNT = 2;

/**
 * A `superior` attribute is optional, and paid for with a `rudimentary` flaw:
 * take both or neither.
 */
export const CREATION_SUPERIOR_COUNT = 1;

/** Skills, by tier, every character starts with. */
export const CREATION_SKILL_BUDGET = new Map<CreationSkillTier, number>([
  ['artisan', 1],
  ['apprentice', 2],
]);

/** Total skills declared at creation. */
export const CREATION_SKILL_COUNT = [...CREATION_SKILL_BUDGET.values()].reduce(
  (total, count) => total + count,
  0
);

/** Shortest acceptable skill name, in words. */
export const SKILL_NAME_MIN_WORDS = 2;

/** Longest acceptable skill name, in characters. */
export const SKILL_NAME_MAX_LENGTH = 60;

/**
 * Skill names are present-tense action phrases — `break sealed doors`, not
 * `investigation`. Nothing can check for a verb without a dictionary, but a
 * leading nominalization is the reliable tell that a player typed a discipline
 * label instead of a thing their character does.
 */
const SKILL_NAME_NOUN_SUFFIXES = [
  'tion',
  'sion',
  'ment',
  'ness',
  'ity',
  'ance',
  'ence',
  'ing',
  'ics',
  'logy',
  'ship',
  'hood',
];

const SKILL_NAME_LEADING_ARTICLES = ['a', 'an', 'the'];

/** One skill as chosen in the creation form. */
export const CharacterSkillDraft = z.object({
  attribute: Attribute,
  name: z.string().min(1),
  tier: CreationSkillTier,
});
export type CharacterSkillDraft = z.infer<typeof CharacterSkillDraft>;

/**
 * Everything the player authors. The server owns the rest of the character —
 * the id, starting momentum, the empty pack, and the derived tags — so a client
 * cannot mint a sheet of its own design.
 */
export const CharacterDraft = z.object({
  archetype: z.string().min(1).max(60),
  attributes: CharacterAttributes,
  bio: z.string().min(1).max(600),
  name: z.string().min(1).max(80),
  nature: CharacterNature,
  origin: CharacterOrigin,
  pronouns: z.string().min(1).max(40),
  skills: z.array(CharacterSkillDraft).length(CREATION_SKILL_COUNT),
});
export type CharacterDraft = z.infer<typeof CharacterDraft>;

/** The mechanical half of a character, as it comes out of creation. */
export type CharacterBuild = {
  attributes: CharacterAttributes;
  skills: CharacterSkillDraft[];
};

export type CharacterBuildIssue = {
  field: 'attributes' | 'skills';
  message: string;
};

/** Neutral momentum: where every new character starts. */
export const createStartingMomentum = (): MomentumState => ({
  ceiling: MOMENTUM_CEILING,
  current: 0,
  floor: MOMENTUM_FLOOR,
});

/** Every attribute at `standard`, the starting point before picks. */
export const createDefaultCreationAttributes = (): CharacterAttributes => ({
  attunement: 'standard',
  finesse: 'standard',
  focus: 'standard',
  ingenuity: 'standard',
  presence: 'standard',
  resolve: 'standard',
  vitality: 'standard',
});

const countTier = (attributes: CharacterAttributes, tier: string): number =>
  Object.values(attributes).filter((value) => value === tier).length;

export function validateAttributeBudget(attributes: CharacterAttributes): CharacterBuildIssue[] {
  const issues: CharacterBuildIssue[] = [];
  const outOfRange = Object.entries(attributes).filter(
    ([, tier]) => !CreationAttributeTier.safeParse(tier).success
  );
  for (const [name] of outOfRange) {
    issues.push({
      field: 'attributes',
      message: `${name} cannot start at that tier; transcendent is earned in play.`,
    });
  }

  const advanced = countTier(attributes, 'advanced');
  if (advanced !== CREATION_ADVANCED_COUNT) {
    issues.push({
      field: 'attributes',
      message: `Raise exactly ${CREATION_ADVANCED_COUNT} attributes to advanced (currently ${advanced}).`,
    });
  }

  const superior = countTier(attributes, 'superior');
  if (superior > CREATION_SUPERIOR_COUNT) {
    issues.push({
      field: 'attributes',
      message: `At most ${CREATION_SUPERIOR_COUNT} attribute may start at superior (currently ${superior}).`,
    });
  }

  const rudimentary = countTier(attributes, 'rudimentary');
  if (rudimentary !== superior) {
    issues.push({
      field: 'attributes',
      message:
        'A superior attribute is paid for with one rudimentary flaw. Take both, or neither.',
    });
  }

  return issues;
}

export function validateSkillName(name: string): string | null {
  const cleaned = name.trim().replace(/\s+/g, ' ');
  if (cleaned.length === 0) {
    return 'Name this skill.';
  }
  if (cleaned.length > SKILL_NAME_MAX_LENGTH) {
    return `Keep the skill under ${SKILL_NAME_MAX_LENGTH} characters.`;
  }
  const words = cleaned.split(' ');
  if (words.length < SKILL_NAME_MIN_WORDS) {
    return `Use at least ${SKILL_NAME_MIN_WORDS} words describing an action: "read fault bands".`;
  }
  const first = words[0].toLowerCase();
  if (SKILL_NAME_LEADING_ARTICLES.includes(first)) {
    return 'Start with a verb: "cut fouled lines".';
  }
  if (SKILL_NAME_NOUN_SUFFIXES.some((suffix) => first.endsWith(suffix))) {
    return `Start with a present-tense verb, not "${words[0]}": "break sealed doors".`;
  }
  return null;
}

export function validateSkillBudget(skills: CharacterSkillDraft[]): CharacterBuildIssue[] {
  const issues: CharacterBuildIssue[] = [];

  for (const [tier, expected] of CREATION_SKILL_BUDGET) {
    const actual = skills.filter((skill) => skill.tier === tier).length;
    if (actual !== expected) {
      issues.push({
        field: 'skills',
        message: `Declare exactly ${expected} ${tier} ${expected === 1 ? 'skill' : 'skills'} (currently ${actual}).`,
      });
    }
  }

  const seen = new Set<string>();
  for (const skill of skills) {
    const nameIssue = validateSkillName(skill.name);
    if (nameIssue !== null) {
      issues.push({ field: 'skills', message: nameIssue });
      continue;
    }
    const key = skillKey(skill.name);
    if (seen.has(key)) {
      issues.push({ field: 'skills', message: `"${skill.name.trim()}" is declared twice.` });
    }
    seen.add(key);
  }

  return issues;
}

export function validateCharacterBuild(build: CharacterBuild): CharacterBuildIssue[] {
  return [...validateAttributeBudget(build.attributes), ...validateSkillBudget(build.skills)];
}

/** The roll modifier a finished build starts with, shown in the review step. */
export function buildModifierSummary(build: CharacterBuild): {
  attributes: number;
  skills: number;
} {
  const attributes = Object.values(build.attributes).reduce(
    (total, tier) => total + (ATTRIBUTE_MODIFIER_LOOKUP.get(tier) ?? 0),
    0
  );
  const skills = build.skills.reduce(
    (total, skill) => total + (SKILL_MODIFIER_LOOKUP.get(skill.tier) ?? 0),
    0
  );
  return { attributes, skills };
}
