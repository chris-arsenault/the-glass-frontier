import type {
  SkillCheckRequest,
  SkillCheckResult,
  MomentumState,
  OutcomeTier,
  TierThreshold } from '@glass-frontier/dto';
import {
  attributeModifierFromName,
  MOMENTUM_DELTA,
  RISK_LEVEL_MAP,
  type RiskLevel,
  skillModifierFromSkillName,
  TIER_THRESHOLDS,
} from '@glass-frontier/dto';
import { clamp } from '@glass-frontier/utils';

import { DiceRoller } from './DiceRoller';
import { CheckRequestTelemetry } from './telemetry';

const momentumDeltaByTier = new Map<OutcomeTier, number>(
  Object.entries(MOMENTUM_DELTA) as Array<[OutcomeTier, number]>
);
const riskThresholdByLevel = new Map<RiskLevel, number>(
  Object.entries(RISK_LEVEL_MAP) as Array<[RiskLevel, number]>
);

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
    const delta = momentumDeltaByTier.get(tier) ?? 0;
    return clamp(current.current + delta, current.floor, current.ceiling);
  }

  determineTier(margin: number): OutcomeTier {
    for (const [threshold, tier] of TIER_THRESHOLDS as TierThreshold[]) {
      if (margin >= threshold) {
        return tier;
      }
    }
    return 'collapse';
  }

  private resolveRiskThreshold(level: RiskLevel): number {
    return riskThresholdByLevel.get(level) ?? riskThresholdByLevel.get('standard') ?? RISK_LEVEL_MAP.standard;
  }
}

export { SkillCheckResolver };
