/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { Pool } from 'pg';

import { createPool } from './pg';
import { PlayerStore } from './playerStore';
import { PromptTemplateManager } from './promptTemplates/PromptTemplateManager';

export class AppStore {
  readonly playerStore: PlayerStore;
  readonly promptTemplateManager: PromptTemplateManager;

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
  }
}

export const createAppStore = (options?: { connectionString?: string; pool?: Pool }): AppStore =>
  new AppStore(options);
