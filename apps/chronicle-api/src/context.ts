// context.ts
import { createAppStore, type PromptTemplateManager, type PlayerStore, type ModelConfigStore } from '@glass-frontier/app';
import { createOpsStore } from '@glass-frontier/ops';
import { createChronicleStore, createWorldSchemaStore, type WorldSchemaStore, type ChronicleStore } from '@glass-frontier/worldstate';

import { ChronicleSeedService } from './services/chronicleSeedService';

const worldstateDatabaseUrl = process.env.GLASS_FRONTIER_DATABASE_URL;
if (typeof worldstateDatabaseUrl !== 'string' || worldstateDatabaseUrl.trim().length === 0) {
  throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured for the narrative service');
}
const appStore = createAppStore({ connectionString: worldstateDatabaseUrl });
const worldSchemaStore = createWorldSchemaStore({
  connectionString: worldstateDatabaseUrl,
});
const chronicleStore = createChronicleStore({
  connectionString: worldstateDatabaseUrl,
  worldStore: worldSchemaStore,
});

const opsStore = createOpsStore({ connectionString: worldstateDatabaseUrl });
const templateManager = appStore.promptTemplateManager;
const seedService = new ChronicleSeedService({
  templateManager,
  worldStore: worldSchemaStore,
});

export type Context = {
  authorizationHeader?: string;
  appStore: typeof appStore;
  bugReportStore: typeof opsStore.bugReportStore;
  modelConfigStore: ModelConfigStore;
  playerStore: PlayerStore;
  seedService: ChronicleSeedService;
  templateManager: PromptTemplateManager;
  tokenUsageStore: typeof opsStore.tokenUsageStore;
  worldSchemaStore: WorldSchemaStore;
  chronicleStore: ChronicleStore;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    authorizationHeader: options?.authorizationHeader,
    appStore,
    bugReportStore: opsStore.bugReportStore,
    modelConfigStore: appStore.modelConfigStore,
    playerStore: appStore.playerStore,
    seedService,
    templateManager,
    tokenUsageStore: opsStore.tokenUsageStore,
    worldSchemaStore,
    chronicleStore,
  };
}

// export type Context = Awaited<ReturnType<typeof createContext>>;
