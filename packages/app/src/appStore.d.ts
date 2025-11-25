import type { Pool } from 'pg';
import { PlayerStore } from './playerStore';
import { PromptTemplateManager } from './promptTemplates/PromptTemplateManager';
import { ModelConfigStore } from './modelConfigStore';
export declare class AppStore {
    readonly playerStore: PlayerStore;
    readonly promptTemplateManager: PromptTemplateManager;
    readonly modelConfigStore: ModelConfigStore;
    constructor(options?: {
        connectionString?: string;
        pool?: Pool;
    });
}
export declare const createAppStore: (options?: {
    connectionString?: string;
    pool?: Pool;
}) => AppStore;
