import type { AuditReviewRecord } from '@glass-frontier/dto';
import type { Pool } from 'pg';
export declare class AuditReviewStore {
    #private;
    constructor(options?: {
        connectionString?: string;
        pool?: Pool;
    });
    save(review: {
        groupId: string;
        auditId: string;
        reviewerId: string;
        status: string;
        severity: string;
        tags?: string[];
        notes?: string | null;
    }): Promise<AuditReviewRecord>;
    get(reviewId: string): Promise<AuditReviewRecord | null>;
    listByGroup(groupId: string): Promise<AuditReviewRecord[]>;
}
