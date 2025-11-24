import { z } from 'zod';
/** SkillCheckResult */
export declare const SkillCheckResult: z.ZodObject<{
    advantage: z.ZodBoolean;
    checkId: z.ZodString;
    chronicleId: z.ZodString;
    dieSum: z.ZodNumber;
    disadvantage: z.ZodBoolean;
    margin: z.ZodNumber;
    metadata: z.ZodObject<{
        tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
        timestamp: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    newMomentum: z.ZodNumber;
    outcomeTier: z.ZodEnum<{
        breakthrough: "breakthrough";
        advance: "advance";
        stall: "stall";
        regress: "regress";
        collapse: "collapse";
    }>;
    totalModifier: z.ZodNumber;
}, z.core.$strip>;
export type SkillCheckResult = z.infer<typeof SkillCheckResult>;
/** SkillCheckPlan */
export declare const SkillCheckPlan: z.ZodObject<{
    advantage: z.ZodString;
    complicationSeeds: z.ZodArray<z.ZodString>;
    metadata: z.ZodObject<{
        tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
        timestamp: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    riskLevel: z.ZodEnum<{
        controlled: "controlled";
        standard: "standard";
        risky: "risky";
        desperate: "desperate";
    }>;
    attribute: z.ZodEnum<{
        vitality: "vitality";
        finesse: "finesse";
        focus: "focus";
        resolve: "resolve";
        attunement: "attunement";
        ingenuity: "ingenuity";
        presence: "presence";
    }>;
    skill: z.ZodString;
    requiresCheck: z.ZodBoolean;
    creativeSpark: z.ZodBoolean;
}, z.core.$strip>;
export type SkillCheckPlan = z.infer<typeof SkillCheckPlan>;
/** SkillCheckRequest */
export declare const SkillCheckRequest: z.ZodObject<{
    attribute: z.ZodEnum<{
        vitality: "vitality";
        finesse: "finesse";
        focus: "focus";
        resolve: "resolve";
        attunement: "attunement";
        ingenuity: "ingenuity";
        presence: "presence";
    }>;
    character: z.ZodObject<{
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
    checkId: z.ZodString;
    chronicleId: z.ZodString;
    flags: z.ZodArray<z.ZodString>;
    metadata: z.ZodObject<{
        tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
        timestamp: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    riskLevel: z.ZodEnum<{
        controlled: "controlled";
        standard: "standard";
        risky: "risky";
        desperate: "desperate";
    }>;
    skill: z.ZodString;
}, z.core.$strip>;
export type SkillCheckRequest = z.infer<typeof SkillCheckRequest>;
