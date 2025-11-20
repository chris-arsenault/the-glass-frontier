// context.ts
import { createOpsStore } from '@glass-frontier/ops';
import { PromptTemplateManager, createWorldStateStore, createLocationGraphStore, type WorldStateStore, type LocationGraphStore } from '@glass-frontier/worldstate';

import { ChronicleSeedService } from './services/chronicleSeedService';

const worldstateDatabaseUrl = process.env.WORLDSTATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (typeof worldstateDatabaseUrl !== 'string' || worldstateDatabaseUrl.trim().length === 0) {
  throw new Error('WORLDSTATE_DATABASE_URL must be configured for the narrative service');
}
const locationGraphStore = createLocationGraphStore({
  connectionString: worldstateDatabaseUrl,
});
const worldStateStore = createWorldStateStore({
  connectionString: worldstateDatabaseUrl,
  locationGraphStore,
});

const opsStore = createOpsStore({ connectionString: worldstateDatabaseUrl });
const templateManager = new PromptTemplateManager({ worldStateStore });
const seedService = new ChronicleSeedService({
  locationGraphStore,
  templateManager,
});

export type Context = {
  authorizationHeader?: string;
  bugReportStore: typeof opsStore.bugReportStore;
  locationGraphStore: LocationGraphStore;
  seedService: ChronicleSeedService;
  templateManager: PromptTemplateManager;
  tokenUsageStore: typeof opsStore.tokenUsageStore;
  worldStateStore: WorldStateStore;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    authorizationHeader: options?.authorizationHeader,
    bugReportStore: opsStore.bugReportStore,
    locationGraphStore,
    seedService,
    templateManager,
    tokenUsageStore: opsStore.tokenUsageStore,
    worldStateStore,
  };
}

// export type Context = Awaited<ReturnType<typeof createContext>>;
