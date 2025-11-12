"use strict";

import { log  } from "../utils/logger.js";

class CheckMetrics {
  recordCheckRun(envelope) {
    log("info", "telemetry.check.run", {
      checkId: envelope.id,
      sessionId: envelope.sessionId,
      tier: envelope.tier,
      latencyMs: envelope.telemetry?.latencyMs,
      momentumDelta: envelope.momentum?.delta,
      move: envelope.move
    });
  }

  recordCheckVeto(envelope) {
    log("warn", "telemetry.check.veto", {
      checkId: envelope.id,
      sessionId: envelope.sessionId,
      reason: envelope.reason,
      safetyFlags: envelope.safetyFlags
    });
  }

  recordCheckError(error, envelope) {
    log("error", "telemetry.check.error", {
      checkId: envelope?.id,
      sessionId: envelope?.sessionId,
      message: error.message
    });
  }
}

export {
  CheckMetrics
};
