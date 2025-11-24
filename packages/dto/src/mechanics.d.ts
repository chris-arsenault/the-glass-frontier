import { z } from 'zod';
/** constants + validators */
export declare const MOMENTUM_FLOOR = -2;
export declare const MOMENTUM_CEILING = 3;
export declare const MomentumFloor: z.ZodLiteral<-2>;
export declare const MomentumCeiling: z.ZodLiteral<3>;
/** Risk levels */
export declare const RiskLevel: z.ZodEnum<{
    controlled: "controlled";
    standard: "standard";
    risky: "risky";
    desperate: "desperate";
}>;
export type RiskLevel = z.infer<typeof RiskLevel>;
/** If you want to validate the map values exactly */
export declare const RiskLevelMap: z.ZodObject<{
    controlled: z.ZodLiteral<7>;
    desperate: z.ZodLiteral<10>;
    risky: z.ZodLiteral<9>;
    standard: z.ZodLiteral<8>;
}, z.core.$strip>;
export type RiskLevelMap = z.infer<typeof RiskLevelMap>;
export declare const RISK_LEVEL_MAP: {
    readonly controlled: 7;
    readonly desperate: 10;
    readonly risky: 9;
    readonly standard: 8;
};
/** Outcome tiers and momentum delta */
export declare const OutcomeTier: z.ZodEnum<{
    breakthrough: "breakthrough";
    advance: "advance";
    stall: "stall";
    regress: "regress";
    collapse: "collapse";
}>;
export type OutcomeTier = z.infer<typeof OutcomeTier>;
export declare const MomentumDelta: z.ZodObject<{
    advance: z.ZodLiteral<1>;
    breakthrough: z.ZodLiteral<2>;
    collapse: z.ZodLiteral<-2>;
    regress: z.ZodLiteral<-1>;
    stall: z.ZodLiteral<0>;
}, z.core.$strip>;
export type MomentumDelta = z.infer<typeof MomentumDelta>;
export declare const MOMENTUM_DELTA: MomentumDelta;
/** Tier thresholds: array of [number, OutcomeTier] tuples */
export declare const TierThresholds: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodEnum<{
    breakthrough: "breakthrough";
    advance: "advance";
    stall: "stall";
    regress: "regress";
    collapse: "collapse";
}>], null>>;
export type TierThreshold = z.infer<typeof TierThresholds>[number];
export declare const TIER_THRESHOLDS: [number, "breakthrough" | "advance" | "stall" | "regress" | "collapse"][];
/** Attributes */
export declare const Attribute: z.ZodEnum<{
    vitality: "vitality";
    finesse: "finesse";
    focus: "focus";
    resolve: "resolve";
    attunement: "attunement";
    ingenuity: "ingenuity";
    presence: "presence";
}>;
export type Attribute = z.infer<typeof Attribute>;
/** Attribute tier + modifier map */
export declare const AttributeTier: z.ZodEnum<{
    standard: "standard";
    rudimentary: "rudimentary";
    advanced: "advanced";
    superior: "superior";
    transcendent: "transcendent";
}>;
export type AttributeTier = z.infer<typeof AttributeTier>;
export declare const AttributeTierModifier: z.ZodObject<{
    advanced: z.ZodLiteral<1>;
    rudimentary: z.ZodLiteral<-2>;
    standard: z.ZodLiteral<0>;
    superior: z.ZodLiteral<2>;
    transcendent: z.ZodLiteral<4>;
}, z.core.$strip>;
export type AttributeTierModifier = z.infer<typeof AttributeTierModifier>;
export declare const ATTRIBUTE_TIER_MODIFIER: {
    readonly advanced: 1;
    readonly rudimentary: -2;
    readonly standard: 0;
    readonly superior: 2;
    readonly transcendent: 4;
};
/** Character attributes object: every attribute must have a tier */
export declare const CharacterAttributes: z.ZodObject<{
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
export type CharacterAttributes = z.infer<typeof CharacterAttributes>;
/** Skill tier + modifier map */
export declare const SkillTier: z.ZodEnum<{
    fool: "fool";
    apprentice: "apprentice";
    artisan: "artisan";
    virtuoso: "virtuoso";
    legend: "legend";
}>;
export type SkillTier = z.infer<typeof SkillTier>;
export declare const SKILL_TIER_SEQUENCE: readonly ["fool", "apprentice", "artisan", "virtuoso", "legend"];
export declare const SkillTierModifier: z.ZodObject<{
    apprentice: z.ZodLiteral<0>;
    artisan: z.ZodLiteral<1>;
    fool: z.ZodLiteral<-2>;
    legend: z.ZodLiteral<4>;
    virtuoso: z.ZodLiteral<2>;
}, z.core.$strip>;
export type SkillTierModifier = z.infer<typeof SkillTierModifier>;
export declare const SKILL_TIER_MODIFIER: {
    readonly apprentice: 0;
    readonly artisan: 1;
    readonly fool: -2;
    readonly legend: 4;
    readonly virtuoso: 2;
};
/** MomentumState */
export declare const MomentumState: z.ZodObject<{
    ceiling: z.ZodNumber;
    current: z.ZodNumber;
    floor: z.ZodNumber;
}, z.core.$strip>;
export type MomentumState = z.infer<typeof MomentumState>;
/** Skill */
export declare const Skill: z.ZodObject<{
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
}, z.core.$strip>;
export type Skill = z.infer<typeof Skill>;
