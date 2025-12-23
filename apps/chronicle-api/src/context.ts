// context.ts
import type { Pool } from 'pg';
import {
  createAppStore,
  type AppStore,
  type PlayerStore,
  type ModelConfigStore,
  createPoolWithIamAuth,
  useIamAuth,
  createPool,
} from '@glass-frontier/app';
import { createOpsStore, type OpsStore } from '@glass-frontier/ops';
import {
  createChronicleStore,
  createWorldSchemaStore,
  type WorldSchemaStore,
  type ChronicleStore,
} from '@glass-frontier/worldstate';

import { ChronicleSeedService } from './services/chronicleSeedService';

export type Context = {
  authorizationHeader?: string;
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
  if (pool) return; // Already initialized

  pool = await createPoolWithIamAuth();

  appStore = createAppStore({ pool });
  opsStore = createOpsStore({ pool });
  worldSchemaStore = createWorldSchemaStore({ pool });
  chronicleStore = createChronicleStore({ pool, worldStore: worldSchemaStore });
  seedService = new ChronicleSeedService({
    worldStore: worldSchemaStore,
    modelConfigStore: appStore.modelConfigStore,
    templateManager: appStore.promptTemplateManager,
  });
}

/**
 * Initialize context for local development with connection string.
 */
function initializeLocal(): void {
  if (pool) return; // Already initialized

  const connectionString = process.env.GLASS_FRONTIER_DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured');
  }

  pool = createPool({ connectionString });

  appStore = createAppStore({ pool });
  opsStore = createOpsStore({ pool });
  worldSchemaStore = createWorldSchemaStore({ pool });
  chronicleStore = createChronicleStore({ pool, worldStore: worldSchemaStore });
  seedService = new ChronicleSeedService({
    worldStore: worldSchemaStore,
    modelConfigStore: appStore.modelConfigStore,
    templateManager: appStore.promptTemplateManager,
  });
}

export function createContext(options?: { authorizationHeader?: string }): Context {
  // For local development, initialize synchronously on first call
  if (!pool && !useIamAuth()) {
    initializeLocal();
  }

  if (!appStore || !opsStore || !worldSchemaStore || !chronicleStore || !seedService) {
    throw new Error(
      'Context not initialized. For Lambda, call initializeForLambda() at cold start.'
    );
  }

  return {
    authorizationHeader: options?.authorizationHeader,
    appStore,
    bugReportStore: opsStore.bugReportStore,
    modelConfigStore: appStore.modelConfigStore,
    playerStore: appStore.playerStore,
    seedService,
    tokenUsageStore: opsStore.tokenUsageStore,
    worldSchemaStore,
    chronicleStore,
  };
}
