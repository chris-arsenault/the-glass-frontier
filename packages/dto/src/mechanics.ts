import { z } from 'zod';

/** constants + validators */
export const MOMENTUM_FLOOR = -2;
export const MOMENTUM_CEILING = 3;
export const MomentumFloor = z.literal(-2);
export const MomentumCeiling = z.literal(3);

/** Risk levels */
export const RiskLevel = z.enum(['controlled', 'standard', 'risky', 'desperate']);
export type RiskLevel = z.infer<typeof RiskLevel>;

/** If you want to validate the map values exactly */
export const RiskLevelMap = z.object({
  controlled: z.literal(7),
  desperate: z.literal(10),
  risky: z.literal(9),
  standard: z.literal(8),
});
export type RiskLevelMap = z.infer<typeof RiskLevelMap>;

export const RISK_LEVEL_MAP = {
  controlled: 7,
  desperate: 10,
  risky: 9,
  standard: 8,
} as const;

RiskLevelMap.parse(RISK_LEVEL_MAP);

/** Outcome tiers and momentum delta */
export const OutcomeTier = z.enum(['breakthrough', 'advance', 'stall', 'regress', 'collapse']);
export type OutcomeTier = z.infer<typeof OutcomeTier>;

export const MomentumDelta = z.object({
  advance: z.literal(1),
  breakthrough: z.literal(2),
  collapse: z.literal(-2),
  regress: z.literal(-1),
  stall: z.literal(0),
});
export type MomentumDelta = z.infer<typeof MomentumDelta>;

export const MOMENTUM_DELTA: MomentumDelta = MomentumDelta.parse({
  advance: 1,
  breakthrough: 2,
  collapse: -2,
  regress: -1,
  stall: 0,
});

/** Tier thresholds: array of [number, OutcomeTier] tuples */
export const TierThresholds = z.array(z.tuple([z.number(), OutcomeTier]));
export type TierThreshold = z.infer<typeof TierThresholds>[number];

export const TIER_THRESHOLDS = TierThresholds.parse([
  [2, 'breakthrough'],
  [0, 'advance'],
  [-1, 'stall'],
  [-3, 'regress'],
  [-100, 'collapse'],
]);

/** Attributes */
export const Attribute = z.enum([
  'vitality',
  'finesse',
  'focus',
  'resolve',
  'attunement',
  'ingenuity',
  'presence',
]);
export type Attribute = z.infer<typeof Attribute>;

/** Attribute tier + modifier map */
export const AttributeTier = z.enum([
  'rudimentary',
  'standard',
  'advanced',
  'superior',
  'transcendent',
]);
export type AttributeTier = z.infer<typeof AttributeTier>;

export const AttributeTierModifier = z.object({
  advanced: z.literal(1),
  rudimentary: z.literal(-2),
  standard: z.literal(0),
  superior: z.literal(2),
  transcendent: z.literal(4),
});
export type AttributeTierModifier = z.infer<typeof AttributeTierModifier>;

export const ATTRIBUTE_TIER_MODIFIER = {
  advanced: 1,
  rudimentary: -2,
  standard: 0,
  superior: 2,
  transcendent: 4,
} as const;

AttributeTierModifier.parse(ATTRIBUTE_TIER_MODIFIER);

/** Character attributes object: every attribute must have a tier */
export const CharacterAttributes = z.object({
  attunement: AttributeTier,
  finesse: AttributeTier,
  focus: AttributeTier,
  ingenuity: AttributeTier,
  presence: AttributeTier,
  resolve: AttributeTier,
  vitality: AttributeTier,
});
export type CharacterAttributes = z.infer<typeof CharacterAttributes>;

/** Skill tier + modifier map */
export const SkillTier = z.enum(['fool', 'apprentice', 'artisan', 'virtuoso', 'legend']);
export type SkillTier = z.infer<typeof SkillTier>;

export const SKILL_TIER_SEQUENCE = [
  'fool',
  'apprentice',
  'artisan',
  'virtuoso',
  'legend',
] as const satisfies readonly SkillTier[];

export const SkillTierModifier = z.object({
  apprentice: z.literal(0),
  artisan: z.literal(1),
  fool: z.literal(-2),
  legend: z.literal(4),
  virtuoso: z.literal(2),
});
export type SkillTierModifier = z.infer<typeof SkillTierModifier>;

export const SKILL_TIER_MODIFIER = {
  apprentice: 0,
  artisan: 1,
  fool: -2,
  legend: 4,
  virtuoso: 2,
} as const;

SkillTierModifier.parse(SKILL_TIER_MODIFIER);

/** MomentumState */
export const MomentumState = z
  .object({
    ceiling: z.number().int(),
    current: z.number().int(),
    floor: z.number().int(),
  })
  .superRefine((m, ctx) => {
    if (m.floor > m.ceiling) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'floor > ceiling', path: ['floor'] });
    }
    if (m.current < m.floor || m.current > m.ceiling) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'current outside [floor, ceiling]',
        path: ['current'],
      });
    }
  });
export type MomentumState = z.infer<typeof MomentumState>;

/** Skill */
export const Skill = z.object({
  attribute: Attribute, // from your previous schema
  name: z.string().min(1),
  tier: SkillTier, // from your previous schema
  xp: z.number().int().nonnegative(),
});
export type Skill = z.infer<typeof Skill>;
