// context.ts
import { createAppStore, type PromptTemplateManager, type PlayerStore } from '@glass-frontier/app';
import { createOpsStore } from '@glass-frontier/ops';
import { createWorldStateStore, createLocationGraphStore, type WorldStateStore, type LocationGraphStore } from '@glass-frontier/worldstate';

import { ChronicleSeedService } from './services/chronicleSeedService';

const worldstateDatabaseUrl = process.env.WORLDSTATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (typeof worldstateDatabaseUrl !== 'string' || worldstateDatabaseUrl.trim().length === 0) {
  throw new Error('WORLDSTATE_DATABASE_URL must be configured for the narrative service');
}
const appStore = createAppStore({ connectionString: worldstateDatabaseUrl });
const locationGraphStore = createLocationGraphStore({
  connectionString: worldstateDatabaseUrl,
});
const worldStateStore = createWorldStateStore({
  connectionString: worldstateDatabaseUrl,
  locationGraphStore,
});

const opsStore = createOpsStore({ connectionString: worldstateDatabaseUrl });
const templateManager = appStore.promptTemplateManager;
const seedService = new ChronicleSeedService({
  locationGraphStore,
  templateManager,
});

export type Context = {
  authorizationHeader?: string;
  appStore: typeof appStore;
  bugReportStore: typeof opsStore.bugReportStore;
  locationGraphStore: LocationGraphStore;
  playerStore: PlayerStore;
  seedService: ChronicleSeedService;
  templateManager: PromptTemplateManager;
  tokenUsageStore: typeof opsStore.tokenUsageStore;
  worldStateStore: WorldStateStore;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    authorizationHeader: options?.authorizationHeader,
    appStore,
    bugReportStore: opsStore.bugReportStore,
    locationGraphStore,
    playerStore: appStore.playerStore,
    seedService,
    templateManager,
    tokenUsageStore: opsStore.tokenUsageStore,
    worldStateStore,
  };
}

// export type Context = Awaited<ReturnType<typeof createContext>>;
