import {
  createAppStore,
  type AppStore,
  type PlayerStore,
  type ModelConfigStore,
  createLambdaPool,
  useLambdaRuntime,
  createPool,
} from '@glass-frontier/app';
import { createLLMClient, loadOpenAiApiKeyFromSecrets } from '@glass-frontier/llm-client';
import { verifyAuthorizationHeader, type AuthorizedIdentity } from '@glass-frontier/node-utils';
import { createOpsStore, type OpsStore } from '@glass-frontier/ops';
import {
  createChronicleStore,
  createEncyclopediaStore,
  createWorldSchemaStore,
  type WorldSchemaStore,
  type ChronicleStore,
  type EncyclopediaStore,
} from '@glass-frontier/worldstate';
// context.ts
import type { Pool } from 'pg';

import { ChronicleSeedService } from './services/chronicleSeedService';

export type Context = {
  authorizationHeader?: string;
  identity: AuthorizedIdentity;
  appStore: AppStore;
  bugReportStore: OpsStore['bugReportStore'];
  modelConfigStore: ModelConfigStore;
  playerStore: PlayerStore;
  seedService: ChronicleSeedService;
  tokenUsageStore: OpsStore['tokenUsageStore'];
  worldSchemaStore: WorldSchemaStore;
  chronicleStore: ChronicleStore;
  encyclopediaStore: EncyclopediaStore;
};

// Singleton instances - initialized lazily
let pool: Pool | undefined;
let appStore: AppStore | undefined;
let opsStore: OpsStore | undefined;
let worldSchemaStore: WorldSchemaStore | undefined;
let chronicleStore: ChronicleStore | undefined;
let encyclopediaStore: EncyclopediaStore | undefined;
let seedService: ChronicleSeedService | undefined;

type InitializedStores = {
  appStore: AppStore;
  chronicleStore: ChronicleStore;
  encyclopediaStore: EncyclopediaStore;
  opsStore: OpsStore;
  seedService: ChronicleSeedService;
  worldSchemaStore: WorldSchemaStore;
};

const requireInitializedStores = (): InitializedStores => {
  if (appStore === undefined) {
    throw new Error('Context app store is not initialized.');
  }
  if (chronicleStore === undefined) {
    throw new Error('Context Chronicle store is not initialized.');
  }
  if (encyclopediaStore === undefined) {
    throw new Error('Context Encyclopedia store is not initialized.');
  }
  if (opsStore === undefined) {
    throw new Error('Context operations store is not initialized.');
  }
  if (seedService === undefined) {
    throw new Error('Context seed service is not initialized.');
  }
  if (worldSchemaStore === undefined) {
    throw new Error('Context Atlas store is not initialized.');
  }
  return {
    appStore,
    chronicleStore,
    encyclopediaStore,
    opsStore,
    seedService,
    worldSchemaStore,
  };
};

/**
 * Initialize context for the Lambda runtime.
 * Call this once at cold start.
 */
export async function initializeForLambda(): Promise<void> {
  if (pool !== undefined) {
    return;
  }

  pool = createLambdaPool();
  await loadOpenAiApiKeyFromSecrets();

  appStore = createAppStore({ pool });
  opsStore = createOpsStore({ pool });
  worldSchemaStore = createWorldSchemaStore({ pool });
  chronicleStore = createChronicleStore({ pool });
  encyclopediaStore = createEncyclopediaStore({ pool });
  seedService = new ChronicleSeedService({
    encyclopediaStore,
    llmClient: createLLMClient({ pool }),
    modelConfigStore: appStore.modelConfigStore,
    templateManager: appStore.promptTemplateManager,
    worldStore: worldSchemaStore,
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
    throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured');
  }

  pool = createPool({ connectionString });

  appStore = createAppStore({ pool });
  opsStore = createOpsStore({ pool });
  worldSchemaStore = createWorldSchemaStore({ pool });
  chronicleStore = createChronicleStore({ pool });
  encyclopediaStore = createEncyclopediaStore({ pool });
  seedService = new ChronicleSeedService({
    encyclopediaStore,
    llmClient: createLLMClient(),
    modelConfigStore: appStore.modelConfigStore,
    templateManager: appStore.promptTemplateManager,
    worldStore: worldSchemaStore,
  });
}

export async function createContext(options?: { authorizationHeader?: string }): Promise<Context> {
  // For local development, initialize synchronously on first call
  if (pool === undefined && !useLambdaRuntime()) {
    initializeLocal();
  }

  const stores = requireInitializedStores();
  const identity = await verifyAuthorizationHeader(options?.authorizationHeader);
  return {
    appStore: stores.appStore,
    authorizationHeader: options?.authorizationHeader,
    bugReportStore: stores.opsStore.bugReportStore,
    chronicleStore: stores.chronicleStore,
    encyclopediaStore: stores.encyclopediaStore,
    identity,
    modelConfigStore: stores.appStore.modelConfigStore,
    playerStore: stores.appStore.playerStore,
    seedService: stores.seedService,
    tokenUsageStore: stores.opsStore.tokenUsageStore,
    worldSchemaStore: stores.worldSchemaStore,
  };
}
