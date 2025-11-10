import { log } from "@glass-frontier/utils";

interface TransitionPayload {
  sessionId: string;
  nodeId: string;
  status: "start" | "success" | "error";
  turnSequence: number;
  metadata?: Record<string, unknown>;
}

interface CheckDispatchPayload {
  sessionId: string;
  auditRef: string;
  checkId: string;
}

interface SafetyEventPayload {
  sessionId: string;
  auditRef?: string;
  severity: string;
  flags: string[];
  reason?: string;
}

interface ToolErrorPayload {
  sessionId: string;
  operation: string;
  referenceId?: string;
  attempt: number;
  message: string;
}

interface ToolNotRunPayload {
  sessionId: string;
  operation: string;
}

interface CheckResolutionPayload {
  sessionId: string;
  auditRef?: string;
  checkId: string;
  result: string;
}

class SessionTelemetry {
  recordTransition(payload: TransitionPayload): void {
    log("info", "telemetry.session.transition", {
      sessionId: payload.sessionId,
      nodeId: payload.nodeId,
      status: payload.status,
      turnSequence: payload.turnSequence,
      metadata: payload.metadata ? JSON.stringify(payload.metadata).slice(0, 200) : ""
    });
  }

  recordCheckDispatch(payload: CheckDispatchPayload): void {
    log("info", "telemetry.session.check-dispatch", {
      sessionId: payload.sessionId,
      auditRef: payload.auditRef,
      checkId: payload.checkId
    });
  }

  recordToolError(payload: ToolErrorPayload): void {
    log("error", "telemetry.session.tool-error", {
      sessionId: payload.sessionId,
      operation: payload.operation,
      referenceId: payload.referenceId ?? "",
      attempt: payload.attempt,
      message: payload.message
    });
  }

  recordToolNotRun(payload: ToolNotRunPayload): void {
    log("error", "telemetry.session.tool-not-run", {
      sessionId: payload.sessionId,
      operation: payload.operation,
    });
  }

  recordCheckResolution(payload: CheckResolutionPayload): void {
    log("info", "telemetry.session.check-resolution", {
      sessionId: payload.sessionId,
      auditRef: payload.auditRef ?? "",
      checkId: payload.checkId,
      result: payload.result
    });
  }
}

export { SessionTelemetry };
