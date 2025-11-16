import { DynamoWorldStateStore, type WorldStateStoreV2 } from '@glass-frontier/worldstate';
import { createAwsDynamoClient, createAwsS3Client } from '@glass-frontier/node-utils';

import { GmEngine } from './gmEngine';
import { WorldstateSessionFactory } from './worldstateSession';

const rawBucket = process.env.WORLD_STATE_S3_BUCKET;
if (typeof rawBucket !== 'string' || rawBucket.trim().length === 0) {
  throw new Error('WORLD_STATE_S3_BUCKET must be configured for gm-api');
}
const bucketName = rawBucket.trim();

const rawTable = process.env.WORLD_STATE_TABLE_NAME;
if (typeof rawTable !== 'string' || rawTable.trim().length === 0) {
  throw new Error('WORLD_STATE_TABLE_NAME must be configured for gm-api');
}
const tableName = rawTable.trim();

const rawPrefix = process.env.WORLD_STATE_S3_PREFIX;
const s3Prefix =
  typeof rawPrefix === 'string' && rawPrefix.trim().length > 0 ? rawPrefix.trim() : undefined;

const worldStateStore: WorldStateStoreV2 = new DynamoWorldStateStore({
  bucketName,
  s3Prefix,
  tableName,
  dynamoClient: createAwsDynamoClient(),
  s3Client: createAwsS3Client(),
});

const gmEngine = new GmEngine();
const worldstateSessionFactory = new WorldstateSessionFactory(worldStateStore);

export type Context = {
  authorizationHeader?: string;
  gmEngine: GmEngine;
  worldStateStore: WorldStateStoreV2;
  worldstateSessionFactory: WorldstateSessionFactory;
};

export const createContext = (options?: { authorizationHeader?: string }): Context => ({
  authorizationHeader: options?.authorizationHeader,
  gmEngine,
  worldstateSessionFactory,
  worldStateStore,
});
