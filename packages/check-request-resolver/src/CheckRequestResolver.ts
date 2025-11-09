import {CheckRequest, CheckRequestInput} from "./CheckRequest";
import {DiceRoller} from "./DiceRoller";
import {CheckRequestResult} from "./CheckRequestResult";
import {clamp} from "@glass-frontier/utils";

import {
  MOMENTUM_CEILING,
  MOMENTUM_DELTA,
  MOMENTUM_FLOOR,
  OutcomeTier,
  RISK_LEVEL_MAP,
  TIER_THRESHOLDS
} from "./mechanics";
import {CheckRequestTelemetry} from "./telemetry";


class CheckRequestResolver<T extends CheckRequestInput > {
  request: CheckRequest;
  telemetry: CheckRequestTelemetry;

  constructor(envelope: T) {
    this.request = new CheckRequest(envelope)
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
    const startedAt = Date.now();
    try {
      const roller = new DiceRoller(this.request);
      const dieResult = roller.computeResult();
      const margin = dieResult - RISK_LEVEL_MAP[this.request.riskLevel];
      const outcomeTier = this.determineTier(margin);
      const newMomentum = this.computeMomentum(this.request.momentum, outcomeTier)

      const result = CheckRequestResult.fromCheck(this.request, roller, margin, outcomeTier, newMomentum);
      this.telemetry.recordCheckRun(result);
      return result;
    } catch (error) {
      this.telemetry.recordCheckError(error);
    }
  }

  computeMomentum(current: number, tier: string): number {
    const delta = MOMENTUM_DELTA[tier] ?? 0;
    return clamp(current + delta, MOMENTUM_FLOOR, MOMENTUM_CEILING);
  }

  determineTier(margin: number): OutcomeTier {
    for (const [threshold, tier] of TIER_THRESHOLDS) {
      if (margin >= threshold) return tier;
    }
    return "collapse"; // fallback (should never hit)
  }
}

export { CheckRequestResolver }