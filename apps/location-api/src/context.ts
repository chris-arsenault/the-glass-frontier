import { DynamoWorldStateStore } from '@glass-frontier/worldstate';
import type { WorldStateStoreV2 } from '@glass-frontier/worldstate';

const required = (value: string | undefined | null, name: string): string => {
  if (value?.trim()) return value;
  throw new Error(`location-api missing env var ${name}`);
};

const worldStateStore: WorldStateStoreV2 = new DynamoWorldStateStore({
  bucketName: required(process.env.WORLD_STATE_S3_BUCKET, 'WORLD_STATE_S3_BUCKET'),
  tableName: required(process.env.WORLD_STATE_TABLE_NAME, 'WORLD_STATE_TABLE_NAME'),
  s3Prefix: process.env.WORLD_STATE_S3_PREFIX ?? undefined,
});

export type Context = {
  worldStateStore: WorldStateStoreV2;
  authorizationHeader?: string;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    authorizationHeader: options?.authorizationHeader,
    worldStateStore,
  };
}
