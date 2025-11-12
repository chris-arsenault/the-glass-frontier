import type {
  SkillCheckRequest,
  SkillCheckResult,
  MomentumState,
  OutcomeTier } from '@glass-frontier/dto';
import {
  attributeModifierFromName,
  MOMENTUM_DELTA,
  RISK_LEVEL_MAP,
  skillModifierFromSkillName,
  TIER_THRESHOLDS,
} from '@glass-frontier/dto';
import { clamp } from '@glass-frontier/utils';

import { DiceRoller } from './DiceRoller';
import { CheckRequestTelemetry } from './telemetry';

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
    const target = RISK_LEVEL_MAP[this.request.riskLevel];
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
      if (threshold && tier && margin >= threshold) {return tier;}
    }
    return 'collapse'; // fallback (should never hit)
  }
}

export { SkillCheckResolver };
