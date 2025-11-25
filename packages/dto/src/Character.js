import { z } from 'zod';
import { InventorySchema } from './Inventory';
import { CharacterAttributes, MomentumState, Skill, SKILL_TIER_MODIFIER, ATTRIBUTE_TIER_MODIFIER, } from './mechanics';
/** Character */
export const Character = z.object({
    archetype: z.string().min(1),
    attributes: CharacterAttributes,
    bio: z.string().min(1).optional(),
    id: z.string().min(1),
    inventory: InventorySchema,
    momentum: MomentumState,
    name: z.string().min(1),
    playerId: z.string().min(1),
    pronouns: z.string().min(1),
    skills: z.record(z.string(), Skill),
    tags: z.array(z.string()),
});
const resolveSkill = (character, skill) => {
    const match = Object.entries(character.skills).find(([name]) => name === skill);
    return match?.[1].tier ?? 'fool';
};
const resolveAttributeTier = (character, attribute) => {
    const match = Object.entries(character.attributes).find(([name]) => name === attribute);
    return match?.[1] ?? character.attributes.resolve;
};
const SKILL_MODIFIER_LOOKUP = new Map(Object.entries(SKILL_TIER_MODIFIER));
const ATTRIBUTE_MODIFIER_LOOKUP = new Map(Object.entries(ATTRIBUTE_TIER_MODIFIER));
export function skillModifierFromSkillName(c, skill) {
    const name = resolveSkill(c, skill);
    return SKILL_MODIFIER_LOOKUP.get(name) ?? 0;
}
export function attributeModifierFromName(c, attr) {
    const tier = resolveAttributeTier(c, attr);
    return ATTRIBUTE_MODIFIER_LOOKUP.get(tier) ?? 0;
}
