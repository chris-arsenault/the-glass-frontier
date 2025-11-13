import { log } from '@glass-frontier/utils';

type TransitionPayload = {
  chronicleId: string;
  nodeId: string;
  status: 'start' | 'success' | 'error';
  turnSequence: number;
  metadata?: Record<string, unknown>;
}

type CheckDispatchPayload = {
  chronicleId: string;
  auditRef: string;
  checkId: string;
}

type ToolErrorPayload = {
  chronicleId: string;
  operation: string;
  referenceId?: string;
  attempt: number;
  message: string;
}

type ToolNotRunPayload = {
  chronicleId: string;
  operation: string;
}

type CheckResolutionPayload = {
  chronicleId: string;
  auditRef?: string;
  checkId: string;
  result: string;
}

class ChronicleTelemetry {
  recordTransition(payload: TransitionPayload): void {
    const metadata =
      payload.metadata !== undefined ? JSON.stringify(payload.metadata).slice(0, 200) : '';
    log('info', 'telemetry.chronicle.transition', {
      chronicleId: payload.chronicleId,
      metadata,
      nodeId: payload.nodeId,
      status: payload.status,
      turnSequence: payload.turnSequence,
    });
  }

  recordCheckDispatch(payload: CheckDispatchPayload): void {
    log('info', 'telemetry.chronicle.check-dispatch', {
      auditRef: payload.auditRef,
      checkId: payload.checkId,
      chronicleId: payload.chronicleId,
    });
  }

  recordToolError(payload: ToolErrorPayload): void {
    log('error', 'telemetry.chronicle.tool-error', {
      attempt: payload.attempt,
      chronicleId: payload.chronicleId,
      message: payload.message,
      operation: payload.operation,
      referenceId: payload.referenceId ?? '',
    });
  }

  recordToolNotRun(payload: ToolNotRunPayload): void {
    log('error', 'telemetry.chronicle.tool-not-run', {
      chronicleId: payload.chronicleId,
      operation: payload.operation,
    });
  }

  recordCheckResolution(payload: CheckResolutionPayload): void {
    log('info', 'telemetry.chronicle.check-resolution', {
      auditRef: payload.auditRef ?? '',
      checkId: payload.checkId,
      chronicleId: payload.chronicleId,
      result: payload.result,
    });
  }
}

export { ChronicleTelemetry };
