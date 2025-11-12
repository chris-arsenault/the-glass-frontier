import { z } from 'zod';

import { Inventory as CharacterInventory, createEmptyInventory } from './Inventory';
import type {
  Attribute,
  AttributeTier,
  SkillTier } from './mechanics';
import {
  CharacterAttributes,
  MomentumState,
  Skill,
  SKILL_TIER_MODIFIER,
  ATTRIBUTE_TIER_MODIFIER,
} from './mechanics';

/** Character */
export const Character = z.object({
  archetype: z.string().min(1),
  attributes: CharacterAttributes,
  id: z.string().min(1),
  inventory: CharacterInventory.default(createEmptyInventory()),
  loginId: z.string().min(1),
  momentum: MomentumState,
  name: z.string().min(1),
  pronouns: z.string().min(1),
  skills: z.record(z.string(), Skill),
  tags: z.array(z.string()),
});
export type Character = z.infer<typeof Character>;

const resolveSkill = (character: Character, skill: string): SkillTier => {
  const match = Object.entries(character.skills).find(([name]) => name === skill);
  return match?.[1].tier ?? 'fool';
};

const resolveAttributeTier = (character: Character, attribute: Attribute): AttributeTier => {
  const match = Object.entries(character.attributes).find(([name]) => name === attribute);
  return match?.[1] ?? character.attributes.resolve;
};

const SKILL_MODIFIER_LOOKUP = new Map<SkillTier, number>(
  Object.entries(SKILL_TIER_MODIFIER) as Array<[SkillTier, number]>,
);
const ATTRIBUTE_MODIFIER_LOOKUP = new Map<AttributeTier, number>(
  Object.entries(ATTRIBUTE_TIER_MODIFIER) as Array<[AttributeTier, number]>,
);

export function skillModifierFromSkillName(c: Character, skill: string): number {
  const name: SkillTier = resolveSkill(c, skill);
  return SKILL_MODIFIER_LOOKUP.get(name) ?? 0;
}

export function attributeModifierFromName(c: Character, attr: Attribute): number {
  const tier = resolveAttributeTier(c, attr);
  return ATTRIBUTE_MODIFIER_LOOKUP.get(tier) ?? 0;
}
