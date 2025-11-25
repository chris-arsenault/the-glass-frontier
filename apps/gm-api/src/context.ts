// context.ts
import type { Pool } from 'pg';
import {
  createAppStore,
  type AppStore,
  type PromptTemplateManager,
  type PlayerStore,
  createPoolWithIamAuth,
  useIamAuth,
  createPool,
} from '@glass-frontier/app';
import {
  createChronicleStore,
  createWorldSchemaStore,
  LocationHelpers,
  type ChronicleStore,
  type WorldSchemaStore,
} from '@glass-frontier/worldstate';

import { GmEngine } from './gmEngine';
import { createLLMClient, createDefaultRegistry, syncRegistryToDatabase } from '@glass-frontier/llm-client';

export type Context = {
  authorizationHeader?: string;
  appStore: AppStore;
  engine: GmEngine;
  locationHelpers: LocationHelpers;
  worldSchemaStore: WorldSchemaStore;
  playerStore: PlayerStore;
  templateManager: PromptTemplateManager;
  chronicleStore: ChronicleStore;
};

// Singleton instances - initialized lazily
let pool: Pool | undefined;
let appStore: AppStore | undefined;
let worldSchemaStore: WorldSchemaStore | undefined;
let chronicleStore: ChronicleStore | undefined;
let locationHelpers: LocationHelpers | undefined;
let engine: GmEngine | undefined;

/**
 * Initialize context for Lambda with IAM auth.
 * Call this once at cold start.
 */
export async function initializeForLambda(): Promise<void> {
  if (pool) return; // Already initialized

  pool = await createPoolWithIamAuth();

  appStore = createAppStore({ pool });
  worldSchemaStore = createWorldSchemaStore({ pool });
  chronicleStore = createChronicleStore({ pool, worldStore: worldSchemaStore });
  locationHelpers = new LocationHelpers(worldSchemaStore);

  // Pass pool to LLM client for audit/usage tracking with IAM auth
  const llmClient = createLLMClient({ pool });

  // Sync model registry to database
  const registry = createDefaultRegistry();
  await syncRegistryToDatabase(registry, appStore.modelConfigStore).catch((error) => {
    console.error('[GM-API] Failed to sync model registry to database:', error);
  });

  engine = new GmEngine({
    locationHelpers,
    templateManager: appStore.promptTemplateManager,
    worldSchemaStore,
    chronicleStore,
    llmClient,
    modelConfigStore: appStore.modelConfigStore,
  });
}

/**
 * Initialize context for local development with connection string.
 */
function initializeLocal(): void {
  if (pool) return; // Already initialized

  const connectionString = process.env.GLASS_FRONTIER_DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured for the GM API.');
  }

  pool = createPool({ connectionString });

  appStore = createAppStore({ pool });
  worldSchemaStore = createWorldSchemaStore({ pool });
  chronicleStore = createChronicleStore({ pool, worldStore: worldSchemaStore });
  locationHelpers = new LocationHelpers(worldSchemaStore);

  const llmClient = createLLMClient();

  // Sync model registry to database on startup
  const registry = createDefaultRegistry();
  void syncRegistryToDatabase(registry, appStore.modelConfigStore).catch((error) => {
    console.error('[GM-API] Failed to sync model registry to database:', error);
  });

  engine = new GmEngine({
    locationHelpers,
    templateManager: appStore.promptTemplateManager,
    worldSchemaStore,
    chronicleStore,
    llmClient,
    modelConfigStore: appStore.modelConfigStore,
  });
}

export function createContext(options?: { authorizationHeader?: string }): Context {
  // For local development, initialize synchronously on first call
  if (!pool && !useIamAuth()) {
    initializeLocal();
  }

  if (!appStore || !worldSchemaStore || !chronicleStore || !locationHelpers || !engine) {
    throw new Error(
      'Context not initialized. For Lambda, call initializeForLambda() at cold start.'
    );
  }

  return {
    authorizationHeader: options?.authorizationHeader,
    appStore,
    engine,
    locationHelpers,
    worldSchemaStore,
    playerStore: appStore.playerStore,
    templateManager: appStore.promptTemplateManager,
    chronicleStore,
  };
}
