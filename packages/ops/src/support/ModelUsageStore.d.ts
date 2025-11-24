import type { Pool } from 'pg';
export type ModelUsageRecord = {
    playerId: string;
    modelId: string;
    providerId: string;
    inputTokens: number;
    outputTokens: number;
};
export declare class ModelUsageStore {
    #private;
    constructor(pool: Pool);
    recordUsage(record: ModelUsageRecord): Promise<void>;
}
