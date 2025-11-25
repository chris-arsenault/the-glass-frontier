import type { BugReport } from '@glass-frontier/dto';
import type { Pool } from 'pg';
export type CreateBugReportPayload = {
    summary: string;
    details: string;
    playerId: string;
    chronicleId?: string | null;
    characterId?: string | null;
    metadata?: Record<string, unknown>;
};
export type UpdateBugReportPayload = {
    adminNotes?: string | null;
    backlogItem?: string | null;
    status?: BugReport['status'];
};
export declare class BugReportStore {
    #private;
    constructor(options?: {
        connectionString?: string;
        pool?: Pool;
    });
    createReport(payload: CreateBugReportPayload): Promise<BugReport>;
    updateReport(reportId: string, payload: UpdateBugReportPayload): Promise<BugReport>;
    getReport(reportId: string): Promise<BugReport | null>;
    listReports(): Promise<BugReport[]>;
}
