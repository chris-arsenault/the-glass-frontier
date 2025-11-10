import { z } from "zod";

import {
  Attribute, AttributeTierModifier, CharacterAttributes, SkillTier,
  SkillTierModifier, MomentumState, Skill
} from "./mechanics";


/** Character */
export const Character = z.object({
  name: z.string().min(1),
  id: z.string().min(1),           // use .uuid() if applicable
  archetype: z.string().min(1),
  pronouns: z.string().min(1),
  tags: z.array(z.string()),
  momentum: MomentumState,   // scene or character: not encoded
  skills: z.record(z.string(), Skill),
  attributes: CharacterAttributes, // from your previous schema
});
export type Character = z.infer<typeof Character>;

export function skillModifierFromSkillName(c: Character, skill: string): number {
  const name: SkillTier = c.skills[skill]?.tier ?? "fool"
  return SkillTierModifier[name];
}

export function attributeModifierFromName(c: Character, attr: Attribute): number {
  return AttributeTierModifier[c.attributes[attr]]
}