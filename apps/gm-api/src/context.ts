// context.ts
import {
  PromptTemplateManager,
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

const locationGraphStore = createLocationGraphStore({ connectionString: worldstateDatabaseUrl });
const worldStateStore = createWorldStateStore({ connectionString: worldstateDatabaseUrl, locationGraphStore });
const templateManager = new PromptTemplateManager({ worldStateStore});
const llmClient = createLLMClient();

const engine = new GmEngine({
  locationGraphStore,
  templateManager,
  worldStateStore,
  llmClient,
});

export type Context = {
  authorizationHeader?: string;
  engine: GmEngine;
  locationGraphStore: LocationGraphStore;
  templateManager: PromptTemplateManager;
  worldStateStore: WorldStateStore;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    authorizationHeader: options?.authorizationHeader,
    engine,
    locationGraphStore,
    templateManager,
    worldStateStore,
  };
}
