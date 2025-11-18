// context.ts
import {
  createWorldStateStore,
  createLocationGraphStore,
  createImbuedRegistryStore,
  type WorldStateStore,
  type LocationGraphStore,
  type ImbuedRegistryStore,
  PromptTemplateManager,
  BugReportStore,
  TokenUsageStore,
} from '@glass-frontier/persistence';

import { ChronicleSeedService } from './services/chronicleSeedService';

const narrativeBucket = process.env.NARRATIVE_S3_BUCKET;
if (typeof narrativeBucket !== 'string' || narrativeBucket.trim().length === 0) {
  throw new Error('NARRATIVE_S3_BUCKET must be configured for the narrative service');
}
const narrativePrefix = process.env.NARRATIVE_S3_PREFIX ?? undefined;

const worldStateStore = createWorldStateStore({
  bucket: narrativeBucket,
  prefix: narrativePrefix,
});
const locationGraphStore = createLocationGraphStore({
  bucket: narrativeBucket,
  prefix: narrativePrefix,
});
const imbuedRegistryStore: ImbuedRegistryStore = createImbuedRegistryStore({
  bucket: narrativeBucket,
  prefix: narrativePrefix,
});
const templateBucket = process.env.PROMPT_TEMPLATE_BUCKET;
if (typeof templateBucket !== 'string' || templateBucket.trim().length === 0) {
  throw new Error('PROMPT_TEMPLATE_BUCKET must be configured for the narrative service');
}
const templateManager = new PromptTemplateManager({
  bucket: templateBucket.trim(),
  worldStateStore,
});
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
  imbuedRegistryStore: ImbuedRegistryStore;
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
    imbuedRegistryStore,
    locationGraphStore,
    seedService,
    templateManager,
    tokenUsageStore,
    worldStateStore,
  };
}

// export type Context = Awaited<ReturnType<typeof createContext>>;
