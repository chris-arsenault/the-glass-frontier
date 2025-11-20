// context.ts
import { PromptTemplateManager, createWorldStateStore, createLocationGraphStore, type WorldStateStore, type LocationGraphStore } from '@glass-frontier/worldstate';
import { BugReportStore, TokenUsageStore } from '@glass-frontier/ops';

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

const templateManager = new PromptTemplateManager({ worldStateStore });
const seedService = new ChronicleSeedService({
  locationGraphStore,
  templateManager,
});

const bugReportStore = new BugReportStore({ connectionString: worldstateDatabaseUrl });

const tokenUsageStore = new TokenUsageStore({ connectionString: worldstateDatabaseUrl });

export type Context = {
  authorizationHeader?: string;
  bugReportStore: BugReportStore;
  locationGraphStore: LocationGraphStore;
  seedService: ChronicleSeedService;
  templateManager: PromptTemplateManager;
  tokenUsageStore: TokenUsageStore;
  worldStateStore: WorldStateStore;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    authorizationHeader: options?.authorizationHeader,
    bugReportStore,
    locationGraphStore,
    seedService,
    templateManager,
    tokenUsageStore,
    worldStateStore,
  };
}

// export type Context = Awaited<ReturnType<typeof createContext>>;
