import { log } from "@glass-frontier/utils";

interface TransitionPayload {
  chronicleId: string;
  nodeId: string;
  status: "start" | "success" | "error";
  turnSequence: number;
  metadata?: Record<string, unknown>;
}

interface CheckDispatchPayload {
  chronicleId: string;
  auditRef: string;
  checkId: string;
}

interface SafetyEventPayload {
  chronicleId: string;
  auditRef?: string;
  severity: string;
  flags: string[];
  reason?: string;
}

interface ToolErrorPayload {
  chronicleId: string;
  operation: string;
  referenceId?: string;
  attempt: number;
  message: string;
}

interface ToolNotRunPayload {
  chronicleId: string;
  operation: string;
}

interface CheckResolutionPayload {
  chronicleId: string;
  auditRef?: string;
  checkId: string;
  result: string;
}

class ChronicleTelemetry {
  recordTransition(payload: TransitionPayload): void {
    log("info", "telemetry.chronicle.transition", {
      chronicleId: payload.chronicleId,
      nodeId: payload.nodeId,
      status: payload.status,
      turnSequence: payload.turnSequence,
      metadata: payload.metadata ? JSON.stringify(payload.metadata).slice(0, 200) : ""
    });
  }

  recordCheckDispatch(payload: CheckDispatchPayload): void {
    log("info", "telemetry.chronicle.check-dispatch", {
      chronicleId: payload.chronicleId,
      auditRef: payload.auditRef,
      checkId: payload.checkId
    });
  }

  recordToolError(payload: ToolErrorPayload): void {
    log("error", "telemetry.chronicle.tool-error", {
      chronicleId: payload.chronicleId,
      operation: payload.operation,
      referenceId: payload.referenceId ?? "",
      attempt: payload.attempt,
      message: payload.message
    });
  }

  recordToolNotRun(payload: ToolNotRunPayload): void {
    log("error", "telemetry.chronicle.tool-not-run", {
      chronicleId: payload.chronicleId,
      operation: payload.operation,
    });
  }

  recordCheckResolution(payload: CheckResolutionPayload): void {
    log("info", "telemetry.chronicle.check-resolution", {
      chronicleId: payload.chronicleId,
      auditRef: payload.auditRef ?? "",
      checkId: payload.checkId,
      result: payload.result
    });
  }
}

export { ChronicleTelemetry };
