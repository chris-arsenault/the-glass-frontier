/**
 * Envelope for offline job lifecycle events
 * Corresponds to: offline.sessionClosure.queued, started, completed, failed
 */
export class OfflineJobEvent extends BaseEnvelope {
    static deserialize(data: any): OfflineJobEvent;
    static queued(jobId: any, attempts?: number): OfflineJobEvent;
    static started(jobId: any, attempts?: number): OfflineJobEvent;
    static completed(jobId: any, result?: null, durationMs?: null): OfflineJobEvent;
    static failed(jobId: any, error: any, durationMs?: null): OfflineJobEvent;
    constructor(data: any, eventType: any);
    jobId: any;
    status: string;
    enqueuedAt: any;
    startedAt: any;
    completedAt: any;
    durationMs: any;
    attempts: any;
    error: any;
    result: any;
    _determineStatus(type: any): "unknown" | "queued" | "processing" | "completed" | "failed";
    serialize(): {
        type: string;
        jobId: any;
        attempts: any;
    };
}
import { BaseEnvelope } from "./BaseEnvelope.js";
//# sourceMappingURL=OfflineJobEvent.d.ts.map