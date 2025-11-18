// context.ts
import {
  createWorldStateStore,
  createLocationGraphStore,
  type WorldStateStore,
  type LocationGraphStore,
  PromptTemplateManager,
} from '@glass-frontier/persistence';

import { GmEngine } from './gmEngine';
import {createLLMClient } from "@glass-frontier/llm-client";

const worldStateStore = createWorldStateStore({});
const locationGraphStore = createLocationGraphStore({});
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
