// context.ts
import {
  createWorldStateStore as createLegacyWorldStateStore,
  createLocationGraphStore,
  type WorldStateStore as LegacyWorldStateStore,
  type LocationGraphStore,
  PromptTemplateManager,
  BugReportStore,
  TokenUsageStore,
} from '@glass-frontier/persistence';
import {
  DynamoWorldStateStore,
  type WorldStateStoreV2,
} from '@glass-frontier/worldstate';
import { createAwsDynamoClient, createAwsS3Client } from '@glass-frontier/node-utils';

import { NarrativeEngine } from './narrativeEngine';
import { ChronicleSeedService } from './services/chronicleSeedService';

const worldStateBucket = process.env.WORLD_STATE_S3_BUCKET;
if (typeof worldStateBucket !== 'string' || worldStateBucket.trim().length === 0) {
  throw new Error('WORLD_STATE_S3_BUCKET must be configured for the narrative service');
}
const worldStatePrefix = process.env.WORLD_STATE_S3_PREFIX ?? undefined;
const worldStateTable = process.env.WORLD_STATE_TABLE_NAME;
if (typeof worldStateTable !== 'string' || worldStateTable.trim().length === 0) {
  throw new Error('WORLD_STATE_TABLE_NAME must be configured for the narrative service');
}

const sharedDynamoClient = createAwsDynamoClient();
const sharedS3Client = createAwsS3Client();

const worldStateStore: WorldStateStoreV2 = new DynamoWorldStateStore({
  bucketName: worldStateBucket,
  tableName: worldStateTable,
  s3Prefix: worldStatePrefix,
  dynamoClient: sharedDynamoClient,
  s3Client: sharedS3Client,
});
const playerStore: LegacyWorldStateStore = createLegacyWorldStateStore({
  bucket: worldStateBucket,
  prefix: worldStatePrefix,
  worldIndexTable: worldStateTable,
});
const locationGraphStore = createLocationGraphStore({
  bucket: worldStateBucket,
  indexTable: worldStateTable,
  prefix: worldStatePrefix,
});
const templateBucket = process.env.PROMPT_TEMPLATE_BUCKET;
if (typeof templateBucket !== 'string' || templateBucket.trim().length === 0) {
  throw new Error('PROMPT_TEMPLATE_BUCKET must be configured for the narrative service');
}
const templateManager = new PromptTemplateManager({
  bucket: templateBucket.trim(),
  worldStateStore: playerStore,
});
const seedService = new ChronicleSeedService({
  templateManager,
  worldStateStore,
});
const engine = new NarrativeEngine({
  locationGraphStore,
  templateManager,
  worldStateStore,
});
const bugReportStore = new BugReportStore({
  bucket: worldStateBucket,
  prefix: worldStatePrefix,
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
  engine: NarrativeEngine;
  locationGraphStore: LocationGraphStore;
  seedService: ChronicleSeedService;
  templateManager: PromptTemplateManager;
  tokenUsageStore: TokenUsageStore | null;
  worldStateStore: WorldStateStoreV2;
  playerStore: Pick<LegacyWorldStateStore, 'getPlayer' | 'upsertPlayer'>;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    authorizationHeader: options?.authorizationHeader,
    bugReportStore,
    engine,
    locationGraphStore,
    seedService,
    templateManager,
    tokenUsageStore,
    worldStateStore,
    playerStore,
  };
}

// export type Context = Awaited<ReturnType<typeof createContext>>;
