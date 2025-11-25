import type { AuditLogEntry, AuditQueueItem, AuditReviewRecord, PlayerFeedbackRecord } from '@glass-frontier/dto';
import type { Pool } from 'pg';
import { AuditFeedbackStore } from './support/audit/AuditFeedbackStore';
import { AuditGroupStore } from './support/audit/AuditGroupStore';
import { AuditLogStore } from './support/audit/AuditLogStore';
import { AuditReviewStore } from './support/audit/AuditReviewStore';
import { BugReportStore } from './support/BugReportStore';
import { TokenUsageStore } from './support/TokenUsageStore';
import { ModelUsageStore } from './support/ModelUsageStore';
type AuditQueueFilters = {
    cursor?: string;
    endDate?: number;
    groupId?: string;
    limit?: number;
    playerId?: string;
    scopeRef?: string;
    scopeType?: string;
    search?: string;
    startDate?: number;
};
type AuditEntryBundle = {
    entry: AuditLogEntry;
    feedback: PlayerFeedbackRecord[];
    review: AuditReviewRecord | null;
    groupId: string;
};
export declare class OpsStore {
    #private;
    readonly auditFeedbackStore: AuditFeedbackStore;
    readonly auditGroupStore: AuditGroupStore;
    readonly auditLogStore: AuditLogStore;
    readonly auditReviewStore: AuditReviewStore;
    readonly bugReportStore: BugReportStore;
    readonly tokenUsageStore: TokenUsageStore;
    readonly modelUsageStore: ModelUsageStore;
    constructor(options?: {
        connectionString?: string;
        pool?: Pool;
    });
    listAuditQueue(filters: AuditQueueFilters): Promise<{
        cursor: string | null;
        items: AuditEntryBundle[];
    }>;
    getAuditEntry(auditId: string): Promise<AuditEntryBundle | null>;
    saveAuditReview(input: {
        auditId: string;
        groupId: string;
        reviewerId: string;
        status: string;
        severity: string;
        tags?: string[];
        notes?: string | null;
    }): Promise<AuditReviewRecord>;
    saveAuditFeedback(input: Parameters<AuditFeedbackStore['create']>[0]): Promise<PlayerFeedbackRecord>;
    toQueueItems(bundles: AuditEntryBundle[], statusFilter: Set<AuditReviewRecord['status']> | null): AuditQueueItem[];
}
export declare const createOpsStore: (options?: {
    connectionString?: string;
    pool?: Pool;
}) => OpsStore;
export {};
