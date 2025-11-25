import type { TokenUsagePeriod } from '@glass-frontier/dto';
import type { Pool } from 'pg';
type TokenUsageStoreOptions = {
    connectionString?: string;
    pool?: Pool;
};
export declare class TokenUsageStore {
    #private;
    constructor(options: TokenUsageStoreOptions);
    listUsage(playerId: string, limit?: number): Promise<TokenUsagePeriod[]>;
    recordUsage(options: {
        playerId: string;
        metrics: Record<string, number>;
        timestamp?: Date;
    }): Promise<void>;
}
export {};
