export const MOMENTUM_FLOOR = -2;
export const MOMENTUM_CEILING = 3;

export const RISK_LEVEL_MAP = {
  controlled: 7,
  standard: 8,
  risky: 9,
  desperate: 10,
}

export type RiskLevel = keyof typeof RISK_LEVEL_MAP;

export const MOMENTUM_DELTA: Record<string, number> = {
  breakthrough: 2,
  advance: 1,
  stall: 0,
  regress: -1,
  collapse: -2,
}

export type OutcomeTier = keyof typeof MOMENTUM_DELTA;


export const TIER_THRESHOLDS: [number, OutcomeTier][] = [
  [2,  "breakthrough"],
  [0,  "advance"],
  [-1, "stall"],
  [-3, "regress"],
  [-Infinity, "collapse"],
];

export const ATTRIBUTES = [
  "vitality",
  "finesse",
  "focus",
  "resolve",
  "attunement",
  "ingenuity",
  "presence",
] as const;

export type Attribute = (typeof ATTRIBUTES)[number];
export type CharacterAttributes = Record<Attribute, AttributeTier>;

export const ATTRIBUTE_TIER_MODIFIER = {
  rudimentary: -2,
  standard: 0,
  advanced: 1,
  superior: 2,
  transcendent: 4
}

export type AttributeTier = keyof typeof ATTRIBUTE_TIER_MODIFIER;

export const SKILL_TIER_MODIFIER = {
  fool: -2,
  apprentice: 0,
  artisan: 1,
  virtuoso: 2,
  legend: 4
}
export type SkillTier = keyof typeof SKILL_TIER_MODIFIER;
