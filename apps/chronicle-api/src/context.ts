import {
  createAppStore,
  type AppStore,
  type PlayerStore,
  type ModelConfigStore,
  createPoolWithIamAuth,
  useIamAuth,
  createPool,
} from '@glass-frontier/app';
import { createLLMClient, loadLlmApiKeysFromSecrets } from '@glass-frontier/llm-client';
import { verifyAuthorizationHeader, type AuthorizedIdentity } from '@glass-frontier/node-utils';
import { createOpsStore, type OpsStore } from '@glass-frontier/ops';
import {
  createChronicleStore,
  createWorldSchemaStore,
  type WorldSchemaStore,
  type ChronicleStore,
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
};

// Singleton instances - initialized lazily
let pool: Pool | undefined;
let appStore: AppStore | undefined;
let opsStore: OpsStore | undefined;
let worldSchemaStore: WorldSchemaStore | undefined;
let chronicleStore: ChronicleStore | undefined;
let seedService: ChronicleSeedService | undefined;

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
  opsStore = createOpsStore({ pool });
  worldSchemaStore = createWorldSchemaStore({ pool });
  chronicleStore = createChronicleStore({ pool });
  seedService = new ChronicleSeedService({
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
  seedService = new ChronicleSeedService({
    llmClient: createLLMClient(),
    modelConfigStore: appStore.modelConfigStore,
    templateManager: appStore.promptTemplateManager,
    worldStore: worldSchemaStore,
  });
}

export async function createContext(options?: { authorizationHeader?: string }): Promise<Context> {
  // For local development, initialize synchronously on first call
  if (pool === undefined && !useIamAuth()) {
    initializeLocal();
  }

  if (
    appStore === undefined ||
    opsStore === undefined ||
    worldSchemaStore === undefined ||
    chronicleStore === undefined ||
    seedService === undefined
  ) {
    throw new Error(
      'Context not initialized. For Lambda, call initializeForLambda() at cold start.'
    );
  }

  const identity = await verifyAuthorizationHeader(options?.authorizationHeader);
  return {
    appStore,
    authorizationHeader: options?.authorizationHeader,
    bugReportStore: opsStore.bugReportStore,
    chronicleStore,
    identity,
    modelConfigStore: appStore.modelConfigStore,
    playerStore: appStore.playerStore,
    seedService,
    tokenUsageStore: opsStore.tokenUsageStore,
    worldSchemaStore,
  };
}
