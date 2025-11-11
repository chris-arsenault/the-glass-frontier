import { z } from "zod";

/** constants + validators */
export const MOMENTUM_FLOOR = -2;
export const MOMENTUM_CEILING = 3;
export const MomentumFloor = z.literal(-2);
export const MomentumCeiling = z.literal(3);

/** Risk levels */
export const RiskLevel = z.enum(["controlled", "standard", "risky", "desperate"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

/** If you want to validate the map values exactly */
export const RiskLevelMap = z.object({
  controlled: z.literal(7),
  standard: z.literal(8),
  risky: z.literal(9),
  desperate: z.literal(10),
});
export type RiskLevelMap = z.infer<typeof RiskLevelMap>;

export const RISK_LEVEL_MAP = {
  controlled: 7,
  standard: 8,
  risky: 9,
  desperate: 10,
} as const

RiskLevelMap.parse(RISK_LEVEL_MAP)

/** Outcome tiers and momentum delta */
export const OutcomeTier = z.enum(["breakthrough", "advance", "stall", "regress", "collapse"]);
export type OutcomeTier = z.infer<typeof OutcomeTier>;

export const MomentumDelta = z.object({
  breakthrough: z.literal(2),
  advance: z.literal(1),
  stall: z.literal(0),
  regress: z.literal(-1),
  collapse: z.literal(-2),
});
export type MomentumDelta = z.infer<typeof MomentumDelta>;

export const MOMENTUM_DELTA: MomentumDelta = MomentumDelta.parse({
  breakthrough: 2,
  advance: 1,
  stall: 0,
  regress: -1,
  collapse: -2
});

/** Tier thresholds: array of [number, OutcomeTier] tuples */
export const TierThresholds = z.array(z.tuple([z.number(), OutcomeTier]));
export type TierThreshold = z.infer<typeof TierThresholds>[number];

export const TIER_THRESHOLDS = TierThresholds.parse([
  [2,"breakthrough"],
  [0,"advance"],
  [-1,"stall"],
  [-3,"regress"],
  [-100,"collapse"],
]);

/** Attributes */
export const Attribute = z.enum([
  "vitality",
  "finesse",
  "focus",
  "resolve",
  "attunement",
  "ingenuity",
  "presence",
]);
export type Attribute = z.infer<typeof Attribute>;

/** Attribute tier + modifier map */
export const AttributeTier = z.enum(["rudimentary", "standard", "advanced", "superior", "transcendent"]);
export type AttributeTier = z.infer<typeof AttributeTier>;

export const AttributeTierModifier = z.object({
  rudimentary: z.literal(-2),
  standard: z.literal(0),
  advanced: z.literal(1),
  superior: z.literal(2),
  transcendent: z.literal(4),
});
export type AttributeTierModifier = z.infer<typeof AttributeTierModifier>;

export const ATTRIBUTE_TIER_MODIFIER = {
  rudimentary: -2,
  standard: 0,
  advanced: 1,
  superior: 2,
  transcendent: 4,
} as const

AttributeTierModifier.parse(ATTRIBUTE_TIER_MODIFIER)


/** Character attributes object: every attribute must have a tier */
export const CharacterAttributes = z.object({
  vitality: AttributeTier,
  finesse: AttributeTier,
  focus: AttributeTier,
  resolve: AttributeTier,
  attunement: AttributeTier,
  ingenuity: AttributeTier,
  presence: AttributeTier,
});
export type CharacterAttributes = z.infer<typeof CharacterAttributes>;

/** Skill tier + modifier map */
export const SkillTier = z.enum(["fool", "apprentice", "artisan", "virtuoso", "legend"]);
export type SkillTier = z.infer<typeof SkillTier>;

export const SKILL_TIER_SEQUENCE = [
  "fool",
  "apprentice",
  "artisan",
  "virtuoso",
  "legend"
] as const satisfies readonly SkillTier[];

export const SkillTierModifier = z.object({
  fool: z.literal(-2),
  apprentice: z.literal(0),
  artisan: z.literal(1),
  virtuoso: z.literal(2),
  legend: z.literal(4),
});
export type SkillTierModifier = z.infer<typeof SkillTierModifier>;

export const SKILL_TIER_MODIFIER = {
  fool: -2,
  apprentice: 0,
  artisan: 1,
  virtuoso: 2,
  legend: 4,
} as const

SkillTierModifier.parse(SKILL_TIER_MODIFIER)


/** MomentumState */
export const MomentumState = z.object({
  current: z.number().int(),
  floor: z.number().int(),
  ceiling: z.number().int(),
}).superRefine((m, ctx) => {
  if (m.floor > m.ceiling) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["floor"], message: "floor > ceiling" });
  }
  if (m.current < m.floor || m.current > m.ceiling) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["current"], message: "current outside [floor, ceiling]" });
  }
});
export type MomentumState = z.infer<typeof MomentumState>;

/** Skill */
export const Skill = z.object({
  name: z.string().min(1),
  tier: SkillTier,          // from your previous schema
  attribute: Attribute,     // from your previous schema
  xp: z.number().int().nonnegative(),
});
export type Skill = z.infer<typeof Skill>;
