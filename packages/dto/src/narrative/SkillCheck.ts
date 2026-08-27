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
  attribute: Attribute,
  /**
   * No `complicationSeeds`. The planner fires before the dice and before any
   * retrieval, so everything it wrote about consequence was weather — "hidden
   * air vortex", "turbulent eddy" — and it shipped three of them per turn. The
   * complication is now written after the outcome is known by whichever stage
   * has read the world: the scout on the agentic path, the writer on the
   * one-shot.
   */
  creativeSpark: z.boolean(),
  metadata: Metadata,
  requiresCheck: z.boolean(),
  riskLevel: RiskLevel,
  skill: z.string().min(1),
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
