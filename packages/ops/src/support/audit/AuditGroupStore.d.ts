import type { Pool } from 'pg';
export type AuditGroup = {
    id: string;
    scopeType: string;
    scopeRef?: string | null;
    playerId: string;
    chronicleId?: string | null;
    characterId?: string | null;
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};
export declare class AuditGroupStore {
    #private;
    constructor(options?: {
        connectionString?: string;
        pool?: Pool;
    });
    ensureGroup(input: {
        scopeType: string;
        scopeRef?: string | null;
        playerId: string;
        chronicleId?: string | null;
        characterId?: string | null;
        metadata?: Record<string, unknown>;
    }): Promise<AuditGroup>;
    get(groupId: string): Promise<AuditGroup | null>;
}
