import { z } from 'zod';

import { InventorySchema } from './Inventory';
import type {
  Attribute,
  AttributeTier,
  SkillTier } from './mechanics';
import {
  ATTRIBUTE_MODIFIER_LOOKUP,
  CharacterAttributes,
  MomentumState,
  Skill,
  skillKey,
  SKILL_MODIFIER_LOOKUP,
} from './mechanics';

/** How the character stands with the faction they are tied to. */
export const AllegianceStance = z.enum(['member', 'indebted', 'estranged', 'hunted']);
export type AllegianceStance = z.infer<typeof AllegianceStance>;

/**
 * The canon entities a character is rooted in. These are `hard_state` ids, so
 * the narrator can hydrate the real species, culture, homeland and faction
 * rather than inventing them turn by turn.
 */
export const CharacterOrigin = z.object({
  allegianceId: z.string().uuid(),
  allegianceStance: AllegianceStance,
  cultureId: z.string().uuid(),
  homelandId: z.string().uuid(),
  speciesId: z.string().uuid(),
});
export type CharacterOrigin = z.infer<typeof CharacterOrigin>;

/**
 * What the character wants, what undoes them, and what makes them singular.
 * Every field here is something the GM can act on unprompted: `callings` are
 * the agenda, `flaw` is the lever, `instinct` fires without being asked, and
 * `uniqueThing` is true of this character and no one else in the world.
 */
export const CharacterNature = z.object({
  callings: z.array(z.string().min(1)).length(2),
  drive: z.string().min(1),
  flaw: z.string().min(1),
  instinct: z.string().min(1),
  uniqueThing: z.string().min(1),
});
export type CharacterNature = z.infer<typeof CharacterNature>;

/** Character */
export const Character = z.object({
  archetype: z.string().min(1),
  attributes: CharacterAttributes,
  bio: z.string().min(1),
  id: z.string().min(1),
  inventory: InventorySchema,
  momentum: MomentumState,
  name: z.string().min(1),
  nature: CharacterNature,
  origin: CharacterOrigin,
  playerId: z.string().min(1),
  pronouns: z.string().min(1),
  skills: z.record(z.string(), Skill),
  tags: z.array(z.string()),
});
export type Character = z.infer<typeof Character>;

const resolveSkill = (character: Character, skill: string): SkillTier => {
  const key = skillKey(skill);
  const match = Object.entries(character.skills).find(([name]) => skillKey(name) === key);
  return match?.[1].tier ?? 'fool';
};

const resolveAttributeTier = (character: Character, attribute: Attribute): AttributeTier => {
  const match = Object.entries(character.attributes).find(([name]) => name === attribute);
  return match?.[1] ?? character.attributes.resolve;
};

export function skillModifierFromSkillName(c: Character, skill: string): number {
  const name: SkillTier = resolveSkill(c, skill);
  return SKILL_MODIFIER_LOOKUP.get(name) ?? 0;
}

export function attributeModifierFromName(c: Character, attr: Attribute): number {
  const tier = resolveAttributeTier(c, attr);
  return ATTRIBUTE_MODIFIER_LOOKUP.get(tier) ?? 0;
}
