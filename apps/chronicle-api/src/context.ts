// context.ts
import {
  BugReportStore,
  TokenUsageStore,
} from '@glass-frontier/persistence';
import {
  createWorldStateStore,
  createLocationGraphStore,
  type WorldStateStore,
  type LocationGraphStore,
} from '@glass-frontier/worldstate';
import { PromptTemplateManager } from '@glass-frontier/persistence';

import { ChronicleSeedService } from './services/chronicleSeedService';

const narrativeBucket = process.env.NARRATIVE_S3_BUCKET;
if (typeof narrativeBucket !== 'string' || narrativeBucket.trim().length === 0) {
  throw new Error('NARRATIVE_S3_BUCKET must be configured for the narrative service');
}
const narrativePrefix = process.env.NARRATIVE_S3_PREFIX ?? undefined;

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

const bugReportStore = new BugReportStore({
  bucket: narrativeBucket,
  prefix: narrativePrefix,
});

const tokenUsageStore = (() => {
  const tableName = process.env.LLM_PROXY_USAGE_TABLE;
  if (typeof tableName !== 'string' || tableName.trim().length === 0) {
    return null;
  }
  return new TokenUsageStore({ tableName: tableName.trim() });
})();

export type Context = {
  authorizationHeader?: string;
  bugReportStore: BugReportStore;
  locationGraphStore: LocationGraphStore;
  seedService: ChronicleSeedService;
  templateManager: PromptTemplateManager;
  tokenUsageStore: TokenUsageStore | null;
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
