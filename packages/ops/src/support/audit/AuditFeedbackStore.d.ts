import type { PlayerFeedbackRecord } from '@glass-frontier/dto';
import type { Pool } from 'pg';
export declare class AuditFeedbackStore {
    #private;
    constructor(options?: {
        connectionString?: string;
        pool?: Pool;
    });
    create(feedback: {
        groupId: string;
        auditId?: string | null;
        playerId: string;
        sentiment: string;
        note?: string | null;
        comment?: string | null;
        chronicleId: string;
        turnId: string;
        turnSequence: number;
        gmEntryId: string;
        expectedIntentType?: string | null;
        expectedInventoryDelta?: boolean | null;
        expectedInventoryNotes?: string | null;
        expectedLocationChange?: boolean | null;
        expectedLocationNotes?: string | null;
        expectedSkillCheck?: boolean | null;
        expectedSkillNotes?: string | null;
        metadata?: Record<string, unknown>;
    }): Promise<PlayerFeedbackRecord>;
    listByGroup(groupId: string): Promise<PlayerFeedbackRecord[]>;
}
