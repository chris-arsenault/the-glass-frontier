// context.ts
import { createAppStore, type PromptTemplateManager, type PlayerStore } from '@glass-frontier/app';
import {
  createWorldStateStore,
  createLocationGraphStore,
  type WorldStateStore,
  type LocationGraphStore,
} from '@glass-frontier/worldstate';

import { GmEngine } from './gmEngine';
import {createLLMClient } from "@glass-frontier/llm-client";

const worldstateDatabaseUrl = process.env.WORLDSTATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (typeof worldstateDatabaseUrl !== 'string' || worldstateDatabaseUrl.trim().length === 0) {
  throw new Error('WORLDSTATE_DATABASE_URL must be configured for the GM API.');
}

const appStore = createAppStore({ connectionString: worldstateDatabaseUrl });
const locationGraphStore = createLocationGraphStore({ connectionString: worldstateDatabaseUrl });
const worldStateStore = createWorldStateStore({ connectionString: worldstateDatabaseUrl, locationGraphStore });
const templateManager = appStore.promptTemplateManager;
const llmClient = createLLMClient();

const engine = new GmEngine({
  locationGraphStore,
  templateManager,
  worldStateStore,
  llmClient,
});

export type Context = {
  authorizationHeader?: string;
  appStore: typeof appStore;
  engine: GmEngine;
  locationGraphStore: LocationGraphStore;
  playerStore: PlayerStore;
  templateManager: PromptTemplateManager;
  worldStateStore: WorldStateStore;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    authorizationHeader: options?.authorizationHeader,
    appStore,
    engine,
    locationGraphStore,
    playerStore: appStore.playerStore,
    templateManager,
    worldStateStore,
  };
}
