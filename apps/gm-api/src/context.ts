// context.ts
import { createAppStore, type PromptTemplateManager, type PlayerStore } from '@glass-frontier/app';
import {
  createChronicleStore,
  createWorldSchemaStore,
  LocationHelpers,
  type ChronicleStore,
  type WorldSchemaStore,
} from '@glass-frontier/worldstate';

import { GmEngine } from './gmEngine';
import {createLLMClient } from "@glass-frontier/llm-client";
import type { LocationStore } from './types';

const worldstateDatabaseUrl = process.env.GLASS_FRONTIER_DATABASE_URL;
if (typeof worldstateDatabaseUrl !== 'string' || worldstateDatabaseUrl.trim().length === 0) {
  throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured for the GM API.');
}

const appStore = createAppStore({ connectionString: worldstateDatabaseUrl });
const worldSchemaStore = createWorldSchemaStore({ connectionString: worldstateDatabaseUrl });
const locationGraphStore = new LocationHelpers(worldSchemaStore);
const chronicleStore = createChronicleStore({
  connectionString: worldstateDatabaseUrl,
  worldStore: worldSchemaStore,
});
const templateManager = appStore.promptTemplateManager;
const llmClient = createLLMClient();

const engine = new GmEngine({
  locationGraphStore,
  templateManager,
  worldSchemaStore,
  chronicleStore,
  llmClient,
});

export type Context = {
  authorizationHeader?: string;
  appStore: typeof appStore;
  engine: GmEngine;
  locationGraphStore: LocationStore;
  worldSchemaStore: WorldSchemaStore;
  playerStore: PlayerStore;
  templateManager: PromptTemplateManager;
  chronicleStore: ChronicleStore;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    authorizationHeader: options?.authorizationHeader,
    appStore,
    engine,
    locationGraphStore,
    worldSchemaStore,
    playerStore: appStore.playerStore,
    templateManager,
    chronicleStore,
  };
}
