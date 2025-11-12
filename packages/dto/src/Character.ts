import { z } from 'zod';

import { Inventory as CharacterInventory, createEmptyInventory } from './Inventory';
import type {
  Attribute,
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

export function skillModifierFromSkillName(c: Character, skill: string): number {
  const name: SkillTier = c.skills[skill]?.tier ?? 'fool';
  return SKILL_TIER_MODIFIER[name];
}

export function attributeModifierFromName(c: Character, attr: Attribute): number {
  return ATTRIBUTE_TIER_MODIFIER[c.attributes[attr]];
}
