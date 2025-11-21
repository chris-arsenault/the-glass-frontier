import { z } from 'zod';
import { Character } from '../Character';
import { Attribute, OutcomeTier, RiskLevel } from '../mechanics';
import { Metadata } from '../Metadata';
/** SkillCheckResult */
export const SkillCheckResult = z.object({
    advantage: z.boolean(),
    checkId: z.string().min(1),
    chronicleId: z.string().min(1),
    dieSum: z.number(),
    disadvantage: z.boolean(),
    margin: z.number(),
    metadata: Metadata,
    newMomentum: z.number(),
    outcomeTier: OutcomeTier,
    totalModifier: z.number(),
});
/** SkillCheckPlan */
export const SkillCheckPlan = z.object({
    advantage: z.string().min(1),
    complicationSeeds: z.array(z.string()),
    metadata: Metadata,
    riskLevel: RiskLevel,
    attribute: Attribute,
    skill: z.string().min(1),
    requiresCheck: z.boolean(),
    creativeSpark: z.boolean(),
});
/** SkillCheckRequest */
export const SkillCheckRequest = z.object({
    attribute: Attribute,
    character: Character,
    checkId: z.string().min(1),
    chronicleId: z.string().min(1),
    flags: z.array(z.string()),
    metadata: Metadata,
    riskLevel: RiskLevel,
    skill: z.string().min(1),
});
