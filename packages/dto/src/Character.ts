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
 * The canon records a character is rooted in. Species and culture are reusable
 * Encyclopedia entries; homeland and allegiance are particular Atlas entities.
 */
export const CharacterOrigin = z.object({
  allegianceId: z.string().uuid(),
  allegianceStance: AllegianceStance,
  cultureReferenceId: z.string().uuid(),
  homelandId: z.string().uuid(),
  speciesReferenceId: z.string().uuid(),
});
export type CharacterOrigin = z.infer<typeof CharacterOrigin>;

/**
 * Optional detail the GM can use during play: `callings` are goals to apply
 * pressure to, `flaw` is a weakness to exploit, `instinct` is a standing
 * reaction, and `uniqueThing` is a fact true only of this character. A
 * character with none of these plays normally; each one filled in gives the
 * narrator one more specific thing to work with.
 */
export const CharacterNature = z.object({
  callings: z.array(z.string().min(1)).max(2).default([]),
  drive: z.string().min(1).optional(),
  flaw: z.string().min(1).optional(),
  instinct: z.string().min(1).optional(),
  uniqueThing: z.string().min(1).optional(),
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
