import {
  attributeModifierFromName,
  MOMENTUM_DELTA,
  RISK_LEVEL_MAP,
  SkillCheckRequest,
  SkillCheckResult,
  skillModifierFromSkillName,
  TIER_THRESHOLDS,
  MomentumState,
  OutcomeTier
} from "@glass-frontier/dto";
import {DiceRoller} from "./DiceRoller";
import {clamp} from "@glass-frontier/utils";
import {CheckRequestTelemetry} from "./telemetry";


class SkillCheckResolver {
  request: SkillCheckRequest;
  telemetry: CheckRequestTelemetry;

  constructor(req: SkillCheckRequest) {
    this.request = req;
    this.telemetry = new CheckRequestTelemetry(this.request);
  }

  isValid(): boolean {
    return true;
  }

  resolveRequest() {
    if (!this.isValid()) {
      this.telemetry.recordCheckInvalid();
      return;
    }

    try {
      const roller = new DiceRoller(this.request);

      const modifier = this.computeModifier()
      console.log("Modifer")
      console.log(modifier);
      const dieResult = roller.computeResult(modifier);
      console.log("result")
      console.log(dieResult)
      const target = RISK_LEVEL_MAP[this.request.riskLevel]
      console.log("target")
      console.log(target)
      const margin = dieResult - target;
      console.log("margin")
      console.log(margin)
      const outcomeTier: OutcomeTier = this.determineTier(margin);
      const newMomentum = this.computeMomentum(this.request.character.momentum, outcomeTier)
      console.log(this.request.character.momentum)
      console.log(newMomentum)

      const result: SkillCheckResult = {
        advantage: roller.advantage,
        checkId: this.request.checkId,
        dieSum: dieResult,
        disadvantage: roller.disadvantage,
        chronicleId: this.request.chronicleId,
        totalModifier: modifier,
        margin: margin,
        outcomeTier: outcomeTier,
        newMomentum: newMomentum,
        metadata: {
          timestamp: Date.now(),
          tags: []
        }
      };
      this.telemetry.recordCheckRun(result);
      return result;
    } catch (error) {
      this.telemetry.recordCheckError(error);
    }
  }

  computeModifier(): number {
    const skillModifier = skillModifierFromSkillName(this.request.character, this.request.skill);
    const attributeModifier = attributeModifierFromName(this.request.character, this.request.attribute);
    return skillModifier + attributeModifier + this.request.character.momentum.current;
  }

  computeMomentum(current: MomentumState, tier: string): number {
    const delta = MOMENTUM_DELTA[tier] ?? 0;
    return clamp(current.current + delta, current.floor, current.ceiling);
  }

  determineTier(margin: number): OutcomeTier {
    for (const [threshold, tier] of TIER_THRESHOLDS) {
      if (margin >= threshold) return tier;
    }
    return "collapse"; // fallback (should never hit)
  }
}

export { SkillCheckResolver }
