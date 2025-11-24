import { z } from 'zod';
import type { Attribute } from './mechanics';
/** Character */
export declare const Character: z.ZodObject<{
    archetype: z.ZodString;
    attributes: z.ZodObject<{
        attunement: z.ZodEnum<{
            standard: "standard";
            rudimentary: "rudimentary";
            advanced: "advanced";
            superior: "superior";
            transcendent: "transcendent";
        }>;
        finesse: z.ZodEnum<{
            standard: "standard";
            rudimentary: "rudimentary";
            advanced: "advanced";
            superior: "superior";
            transcendent: "transcendent";
        }>;
        focus: z.ZodEnum<{
            standard: "standard";
            rudimentary: "rudimentary";
            advanced: "advanced";
            superior: "superior";
            transcendent: "transcendent";
        }>;
        ingenuity: z.ZodEnum<{
            standard: "standard";
            rudimentary: "rudimentary";
            advanced: "advanced";
            superior: "superior";
            transcendent: "transcendent";
        }>;
        presence: z.ZodEnum<{
            standard: "standard";
            rudimentary: "rudimentary";
            advanced: "advanced";
            superior: "superior";
            transcendent: "transcendent";
        }>;
        resolve: z.ZodEnum<{
            standard: "standard";
            rudimentary: "rudimentary";
            advanced: "advanced";
            superior: "superior";
            transcendent: "transcendent";
        }>;
        vitality: z.ZodEnum<{
            standard: "standard";
            rudimentary: "rudimentary";
            advanced: "advanced";
            superior: "superior";
            transcendent: "transcendent";
        }>;
    }, z.core.$strip>;
    bio: z.ZodOptional<z.ZodString>;
    id: z.ZodString;
    inventory: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<{
            relic: "relic";
            consumable: "consumable";
            supplies: "supplies";
            gear: "gear";
        }>;
        name: z.ZodString;
        description: z.ZodString;
        effect: z.ZodOptional<z.ZodString>;
        quantity: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>>;
    momentum: z.ZodObject<{
        ceiling: z.ZodNumber;
        current: z.ZodNumber;
        floor: z.ZodNumber;
    }, z.core.$strip>;
    name: z.ZodString;
    playerId: z.ZodString;
    pronouns: z.ZodString;
    skills: z.ZodRecord<z.ZodString, z.ZodObject<{
        attribute: z.ZodEnum<{
            vitality: "vitality";
            finesse: "finesse";
            focus: "focus";
            resolve: "resolve";
            attunement: "attunement";
            ingenuity: "ingenuity";
            presence: "presence";
        }>;
        name: z.ZodString;
        tier: z.ZodEnum<{
            fool: "fool";
            apprentice: "apprentice";
            artisan: "artisan";
            virtuoso: "virtuoso";
            legend: "legend";
        }>;
        xp: z.ZodNumber;
    }, z.core.$strip>>;
    tags: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type Character = z.infer<typeof Character>;
export declare function skillModifierFromSkillName(c: Character, skill: string): number;
export declare function attributeModifierFromName(c: Character, attr: Attribute): number;
