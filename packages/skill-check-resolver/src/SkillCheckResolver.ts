import type { MomentumState, OutcomeTier, RiskLevel } from '@glass-frontier/worldstate/dto';
import { clamp } from '@glass-frontier/utils';

import { DiceRoller } from './DiceRoller';
import {
  MOMENTUM_DELTA,
  RISK_LEVEL_MAP,
  TIER_THRESHOLDS,
  attributeModifierFromName,
  skillModifierFromSkillName,
} from './skillMath.js';
import { CheckRequestTelemetry } from './telemetry';
import type { SkillCheckRequest, SkillCheckResult } from './types.js';

class SkillCheckResolver {
  request: SkillCheckRequest;
  telemetry: CheckRequestTelemetry;

  constructor(req: SkillCheckRequest) {
    this.request = req;
    this.telemetry = new CheckRequestTelemetry(this.request);
  }

  resolveRequest(): SkillCheckResult {
    const roller = new DiceRoller(this.request);

    const modifier = this.computeModifier();
    const dieResult = roller.computeResult(modifier);
    const target = this.resolveRiskThreshold(this.request.riskLevel);
    const margin = dieResult - target;
    const outcomeTier: OutcomeTier = this.determineTier(margin);
    const newMomentum = this.computeMomentum(this.request.character.momentum, outcomeTier);

    const result: SkillCheckResult = {
      advantage: roller.advantage,
      checkId: this.request.checkId,
      chronicleId: this.request.chronicleId,
      dieSum: dieResult,
      disadvantage: roller.disadvantage,
      margin: margin,
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      newMomentum: newMomentum,
      outcomeTier: outcomeTier,
      totalModifier: modifier,
    };

    this.telemetry.recordCheckRun(result);
    return result;
  }

  computeModifier(): number {
    const skillModifier = skillModifierFromSkillName(this.request.character, this.request.skill);
    const attributeModifier = attributeModifierFromName(
      this.request.character,
      this.request.attribute
    );
    return skillModifier + attributeModifier + this.request.character.momentum.current;
  }

  computeMomentum(current: MomentumState, tier: OutcomeTier): number {
    const delta = MOMENTUM_DELTA[tier] ?? 0;
    return clamp(current.current + delta, current.floor, current.ceiling);
  }

  determineTier(margin: number): OutcomeTier {
    for (const [threshold, tier] of TIER_THRESHOLDS) {
      if (margin >= threshold) {
        return tier;
      }
    }
    return 'collapse';
  }

  private resolveRiskThreshold(level: RiskLevel): number {
    return RISK_LEVEL_MAP[level] ?? RISK_LEVEL_MAP.standard;
  }
}

export { SkillCheckResolver };
