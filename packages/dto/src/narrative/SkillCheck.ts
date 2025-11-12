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
export type SkillCheckResult = z.infer<typeof SkillCheckResult>;

/** SkillCheckPlan */
export const SkillCheckPlan = z.object({
  advantage: z.string().min(1),
  complicationSeeds: z.array(z.string()),
  metadata: Metadata,
  rationale: z.string().min(1),
  riskLevel: RiskLevel,
});
export type SkillCheckPlan = z.infer<typeof SkillCheckPlan>;

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
export type SkillCheckRequest = z.infer<typeof SkillCheckRequest>;
