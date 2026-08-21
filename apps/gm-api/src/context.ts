import {
  createAppStore,
  type AppStore,
  type PromptTemplateManager,
  type PlayerStore,
  createPoolWithIamAuth,
  useIamAuth,
  createPool,
} from '@glass-frontier/app';
import { createLLMClient, loadLlmApiKeysFromSecrets } from '@glass-frontier/llm-client';
import { verifyAuthorizationHeader, type AuthorizedIdentity } from '@glass-frontier/node-utils';
import {
  createChronicleStore,
  createWorldSchemaStore,
  type ChronicleStore,
  type WorldSchemaStore,
} from '@glass-frontier/worldstate';
// context.ts
import type { Pool } from 'pg';

import { GmEngine } from './gmEngine';

export type Context = {
  authorizationHeader?: string;
  identity: AuthorizedIdentity;
  appStore: AppStore;
  engine: GmEngine;
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
let engine: GmEngine | undefined;

/**
 * Initialize context for Lambda with IAM auth.
 * Call this once at cold start.
 */
export async function initializeForLambda(): Promise<void> {
  if (pool !== undefined) {
    return;
  }

  pool = await createPoolWithIamAuth();
  await loadLlmApiKeysFromSecrets();

  appStore = createAppStore({ pool });
  worldSchemaStore = createWorldSchemaStore({ pool });
  chronicleStore = createChronicleStore({ pool });

  // Pass pool to LLM client for audit/usage tracking with IAM auth
  const llmClient = createLLMClient({ pool });

  engine = new GmEngine({
    chronicleStore,
    llmClient,
    modelConfigStore: appStore.modelConfigStore,
    templateManager: appStore.promptTemplateManager,
    worldSchemaStore,
  });
}

/**
 * Initialize context for local development with connection string.
 */
function initializeLocal(): void {
  if (pool !== undefined) {
    return;
  }

  const connectionString = process.env.GLASS_FRONTIER_DATABASE_URL;
  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured for the GM API.');
  }

  pool = createPool({ connectionString });

  appStore = createAppStore({ pool });
  worldSchemaStore = createWorldSchemaStore({ pool });
  chronicleStore = createChronicleStore({ pool });

  const llmClient = createLLMClient();

  engine = new GmEngine({
    chronicleStore,
    llmClient,
    modelConfigStore: appStore.modelConfigStore,
    templateManager: appStore.promptTemplateManager,
    worldSchemaStore,
  });
}

export async function createContext(options?: { authorizationHeader?: string }): Promise<Context> {
  // For local development, initialize synchronously on first call
  if (pool === undefined && !useIamAuth()) {
    initializeLocal();
  }

  if (
    appStore === undefined ||
    worldSchemaStore === undefined ||
    chronicleStore === undefined ||
    engine === undefined
  ) {
    throw new Error(
      'Context not initialized. For Lambda, call initializeForLambda() at cold start.'
    );
  }

  const identity = await verifyAuthorizationHeader(options?.authorizationHeader);
  return {
    appStore,
    authorizationHeader: options?.authorizationHeader,
    chronicleStore,
    engine,
    identity,
    playerStore: appStore.playerStore,
    templateManager: appStore.promptTemplateManager,
    worldSchemaStore,
  };
}
