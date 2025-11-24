import type { Pool } from 'pg';
export type ModelConfig = {
    modelId: string;
    apiModelId: string | null;
    displayName: string;
    providerId: string;
    isEnabled: boolean;
    maxTokens: number;
    costPer1kInput: number;
    costPer1kOutput: number;
    supportsReasoning: boolean;
    metadata: Record<string, unknown>;
    updatedAt: Date;
};
export type ModelCategory = 'prose' | 'classification';
export type ModelCategoryConfig = {
    id: string;
    category: ModelCategory;
    modelId: string;
    playerId: string | null;
    createdAt: Date;
    updatedAt: Date;
};
export type ModelUsage = {
    id: string;
    playerId: string;
    modelId: string;
    providerId: string;
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
    date: Date;
    createdAt: Date;
    updatedAt: Date;
};
export declare class ModelConfigStore {
    #private;
    constructor(options: {
        pool: Pool;
    });
    listModels(): Promise<ModelConfig[]>;
    getModelForCategory(category: ModelCategory, playerId?: string): Promise<string>;
    setCategoryModel(category: ModelCategory, modelId: string, playerId?: string): Promise<void>;
    recordUsage(playerId: string, modelId: string, providerId: string, inputTokens: number, outputTokens: number): Promise<void>;
    getUsageByPlayer(playerId: string, startDate?: Date, endDate?: Date): Promise<ModelUsage[]>;
    upsertModel(config: Omit<ModelConfig, 'metadata' | 'updatedAt'>): Promise<void>;
}
