import { log } from "@glass-frontier/utils";
import {CheckRequest} from "./CheckRequest";
import {CheckRequestResult} from "./CheckRequestResult";

class CheckRequestTelemetry {
  request: CheckRequest;

  constructor(request: CheckRequest) {
    this.request = request;
  }

  recordCheckInvalid(): void {
    log("error", "telemetry.check.valid", {
      sessionId: this.request.sessionId,
      checkId: this.request.checkId,
      valid: false
    });
  }

  recordCheckRun(result: CheckRequestResult): void {
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
