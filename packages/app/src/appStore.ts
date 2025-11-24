/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { Pool } from 'pg';

import { createPool } from './pg';
import { PlayerStore } from './playerStore';
import { PromptTemplateManager } from './promptTemplates/PromptTemplateManager';
import { ModelConfigStore } from './modelConfigStore';

export class AppStore {
  readonly playerStore: PlayerStore;
  readonly promptTemplateManager: PromptTemplateManager;
  readonly modelConfigStore: ModelConfigStore;

  constructor(options?: { connectionString?: string; pool?: Pool }) {
    const pool =
      options?.pool ??
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

export const createAppStore = (options?: { connectionString?: string; pool?: Pool }): AppStore =>
  new AppStore(options);
