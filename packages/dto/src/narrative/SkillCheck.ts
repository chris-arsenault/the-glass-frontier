import { z } from "zod";
import {Attribute, OutcomeTier, RiskLevel} from "../mechanics";
import {Character} from "../Character";
import {Metadata} from "../Metadata";

/** SkillCheckResult */
export const SkillCheckResult = z.object({
  sessionId: z.string().min(1),
  checkId: z.string().min(1),
  totalModifier: z.number(),
  advantage: z.boolean(),
  disadvantage: z.boolean(),
  dieSum: z.number(),
  margin: z.number(),
  outcomeTier: OutcomeTier,
  newMomentum: z.number(),
  metadata: Metadata,
});
export type SkillCheckResult = z.infer<typeof SkillCheckResult>;

/** SkillCheckPlan */
export const SkillCheckPlan = z.object({
  riskLevel: RiskLevel,
  advantage: z.string().min(1),
  rationale: z.string().min(1),
  complicationSeeds: z.array(z.string()),
  metadata: Metadata,
});
export type SkillCheckPlan = z.infer<typeof SkillCheckPlan>;

/** SkillCheckRequest */
export const SkillCheckRequest = z.object({
  sessionId: z.string().min(1),
  checkId: z.string().min(1),
  flags: z.array(z.string()),
  attribute: Attribute,
  skill: z.string().min(1),
  character: Character,
  riskLevel: RiskLevel,
  metadata: Metadata,
});
export type SkillCheckRequest = z.infer<typeof SkillCheckRequest>;