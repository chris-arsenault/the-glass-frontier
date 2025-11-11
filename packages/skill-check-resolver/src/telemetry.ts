import { log } from "@glass-frontier/utils";
import {SkillCheckRequest, SkillCheckResult} from "@glass-frontier/dto";

class CheckRequestTelemetry {
  request: SkillCheckRequest;

  constructor(request: SkillCheckRequest) {
    this.request = request;
  }

  recordCheckInvalid(): void {
    log("error", "telemetry.check.valid", {
      chronicleId: this.request.chronicleId,
      checkId: this.request.checkId,
      valid: false
    });
  }

  recordCheckRun(result: SkillCheckResult): void {
    log("info", "telemetry.check.result", {
      chronicleId: this.request.chronicleId,
      checkId: this.request.checkId,
      outcome: result.outcomeTier
    });
  }

  recordCheckError(error: any): void {
    log("error", "telemetry.check.error", {
      chronicleId: this.request.chronicleId,
      checkId: this.request.checkId,
      error: error?.message
    });
  }
}

export { CheckRequestTelemetry };
