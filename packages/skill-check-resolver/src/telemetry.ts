import type { SkillCheckRequest, SkillCheckResult } from '@glass-frontier/dto';
import type { ErrorInfo } from '@glass-frontier/utils';
import { log } from '@glass-frontier/utils';

class CheckRequestTelemetry {
  request: SkillCheckRequest;

  constructor(request: SkillCheckRequest) {
    this.request = request;
  }

  recordCheckInvalid(): void {
    log('error', 'telemetry.check.valid', {
      checkId: this.request.checkId,
      chronicleId: this.request.chronicleId,
      valid: false,
    });
  }

  recordCheckRun(result: SkillCheckResult): void {
    log('info', 'telemetry.check.result', {
      checkId: this.request.checkId,
      chronicleId: this.request.chronicleId,
      outcome: result.outcomeTier,
    });
  }

  recordCheckError(error: ErrorInfo): void {
    log('error', 'telemetry.check.error', {
      checkId: this.request.checkId,
      chronicleId: this.request.chronicleId,
      error: error.message,
    });
  }
}

export { CheckRequestTelemetry };
