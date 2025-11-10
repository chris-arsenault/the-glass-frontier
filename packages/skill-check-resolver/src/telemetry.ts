import { log } from "@glass-frontier/utils";
import {SkillCheckRequest, SkillCheckResult} from "@glass-frontier/dto";

class CheckRequestTelemetry {
  request: SkillCheckRequest;

  constructor(request: SkillCheckRequest) {
    this.request = request;
  }

  recordCheckInvalid(): void {
    log("error", "telemetry.check.valid", {
      sessionId: this.request.sessionId,
      checkId: this.request.checkId,
      valid: false
    });
  }

  recordCheckRun(result: SkillCheckResult): void {
    log("info", "telemetry.check.result", {
      sessionId: this.request.sessionId,
      checkId: this.request.checkId,
      outcome: result.outcomeTier
    });
  }

  recordCheckError(error: any): void {
    log("error", "telemetry.check.error", {
      sessionId: this.request.sessionId,
      checkId: this.request.checkId,
      error: error?.message
    });
  }
}

export { CheckRequestTelemetry };
