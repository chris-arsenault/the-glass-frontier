import {Attribute, CharacterAttributes, SkillTier} from "./mechanics";

export interface MomentumState {
  current: number;
  floor: number;
  ceiling: number;
}

export type Skill = {
  tier: SkillTier,
  attribute: Attribute,
  xp: number
}

export type Character = {
  name: string;
  id: string;
  archetype: string;
  pronouns: string;
  tags: string[];
  momentum: MomentumState; //scene or character?
  skills: Record<string, Skill>;
  attributes: CharacterAttributes;
}