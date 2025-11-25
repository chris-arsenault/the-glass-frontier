import { createPool } from './pg';
import { PlayerStore } from './playerStore';
import { PromptTemplateManager } from './promptTemplates/PromptTemplateManager';
import { ModelConfigStore } from './modelConfigStore';
export class AppStore {
    playerStore;
    promptTemplateManager;
    modelConfigStore;
    constructor(options) {
        const pool = options?.pool ??
            createPool({
                connectionString: options?.connectionString,
                pool: options?.pool,
            });
        this.playerStore = new PlayerStore({ pool });
        this.promptTemplateManager = new PromptTemplateManager({
            playerStore: this.playerStore,
            pool,
        });
        this.modelConfigStore = new ModelConfigStore({ pool });
    }
}
export const createAppStore = (options) => new AppStore(options);
