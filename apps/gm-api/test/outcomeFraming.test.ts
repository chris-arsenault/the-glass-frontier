import type { SkillCheckPlan, SkillCheckResult } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { formatSkillCheck } from '../src/prompts/contextFormaters';

const plan = (): SkillCheckPlan => ({
  advantage: 'none',
  attribute: 'presence',
  creativeSpark: false,
  metadata: { tags: [], timestamp: 0 },
  requiresCheck: true,
  riskLevel: 'risky',
  skill: 'manipulate others',
});

const result = (overrides: Partial<SkillCheckResult> = {}): SkillCheckResult => ({
  advantage: false,
  checkId: 'check-1',
  chronicleId: 'chronicle-1',
  dieSum: 5,
  disadvantage: false,
  margin: -4,
  metadata: { tags: [], timestamp: 0 },
  newMomentum: 0,
  outcomeTier: 'collapse',
  totalModifier: 0,
  ...overrides,
});

const outcome = (overrides: Partial<SkillCheckResult> = {}): string =>
  String(formatSkillCheck(plan(), result(overrides)).outcome ?? '');

describe('outcome framing', () => {
  it('states what the check did to what the character was reaching for', () => {
    // The tier used to arrive as its own name beside "honor its tier", and no
    // template ever said what the five names mean.
    expect(outcome({ outcomeTier: 'collapse' })).toContain('failed at it');
    expect(outcome({ outcomeTier: 'regress' })).toContain('did not get what they were after');
    expect(outcome({ outcomeTier: 'advance' })).toContain('get what they were reaching for');
  });

  it('never names the tier it came from', () => {
    for (const tier of ['breakthrough', 'advance', 'stall', 'regress', 'collapse'] as const) {
      expect(outcome({ outcomeTier: tier })).not.toContain(tier);
    }
  });

  it('never names the skill, which is a slug the narrator is forbidden to say', () => {
    // gpt-oss quoted one into the prose: "your fledgling 'negotiate deals' skill".
    expect(outcome()).not.toContain('manipulate others');
    expect(outcome()).toContain('what they described');
  });

  it('reads the same at every magnitude, because the tier is the magnitude', () => {
    expect(outcome({ margin: -9 })).toBe(outcome({ margin: -5 }));
  });

  it('carries momentum as footing rather than a number', () => {
    expect(outcome({ newMomentum: -2 })).toContain('worn footing');
    expect(outcome({ newMomentum: 2 })).toContain('good run');
    expect(outcome({ newMomentum: 0 })).not.toContain('footing');
  });

  it('colours the swing the roll ran under without contradicting the result', () => {
    expect(outcome({ advantage: true })).toContain('working in their favour');
    expect(outcome({ disadvantage: true })).toContain('against the odds');
    expect(outcome()).not.toContain('going in');
  });

  it('says nothing at all when no check ran', () => {
    const block = formatSkillCheck(plan(), null);

    expect(block.outcome).toBeUndefined();
    expect(block.requiresCheck).toBe(true);
  });

  it('no longer carries seeds the planner wrote before the dice', () => {
    expect(formatSkillCheck(plan(), result())).not.toHaveProperty('complicationSeeds');
  });
});
