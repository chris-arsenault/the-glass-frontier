import type { SkillCheckPlan, SkillCheckResult } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { formatSkillCheck } from '../src/prompts/contextFormaters';

const plan = (): SkillCheckPlan => ({
  advantage: 'none',
  attribute: 'presence',
  complicationSeeds: [
    'Patrol sees through her act',
    'Scum grabs her before officers arrive',
    'Onlookers begin to whisper accusations',
  ],
  creativeSpark: false,
  metadata: { tags: [], timestamp: 0 },
  requiresCheck: true,
  riskLevel: 'risky',
  skill: 'Manipulate others',
});

const result = (outcomeTier: SkillCheckResult['outcomeTier']): SkillCheckResult => ({
  advantage: false,
  checkId: 'check-1',
  chronicleId: 'chronicle-1',
  dieSum: 5,
  disadvantage: false,
  margin: -4,
  metadata: { tags: [], timestamp: 0 },
  newMomentum: -2,
  outcomeTier,
  totalModifier: 1,
});

const seedsFor = (outcomeTier: SkillCheckResult['outcomeTier']): unknown =>
  formatSkillCheck(plan(), result(outcomeTier)).complicationSeeds;

describe('complication seeds', () => {
  it.each(['stall', 'regress', 'collapse'] as const)(
    'hands the narrator exactly one seed on %s',
    (outcomeTier) => {
      expect(seedsFor(outcomeTier)).toStrictEqual(['Patrol sees through her act']);
    }
  );

  it.each(['advance', 'breakthrough'] as const)(
    'hands the narrator no seeds on %s',
    (outcomeTier) => {
      expect(seedsFor(outcomeTier)).toStrictEqual([]);
    }
  );

  it('hands the narrator no seeds when no check ran', () => {
    expect(formatSkillCheck(plan(), null).complicationSeeds).toStrictEqual([]);
  });
});
