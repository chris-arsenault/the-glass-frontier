import type { AuditLogEntry } from '@glass-frontier/dto';
import type { Pool } from 'pg';
export type AuditLogListOptions = {
    limit?: number;
    cursor?: string;
    groupId?: string;
    playerId?: string;
    turnId?: string;
    chronicleId?: string;
    scopeType?: string;
    scopeRef?: string;
    startDate?: number;
    endDate?: number;
    search?: string;
};
export type AuditLogListResult = {
    entries: Array<{
        entry: AuditLogEntry;
        groupId: string;
    }>;
    nextCursor?: string;
};
export declare class AuditLogStore {
    #private;
    constructor(options?: {
        connectionString?: string;
        pool?: Pool;
    });
    record(entry: {
        id?: string;
        groupId: string;
        playerId: string;
        providerId: string;
        request: unknown;
        response: unknown;
        metadata?: Record<string, unknown>;
        chronicleId?: string | null;
        characterId?: string | null;
        turnId?: string | null;
        createdAt?: Date;
    }): Promise<void>;
    get(entryId: string): Promise<{
        entry: AuditLogEntry;
        groupId: string;
    } | null>;
    listRecent(options?: AuditLogListOptions): Promise<AuditLogListResult>;
}
