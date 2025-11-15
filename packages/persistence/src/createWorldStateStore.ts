'use strict';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { S3Client } from '@aws-sdk/client-s3';

import { resolveAwsEndpoint, resolveAwsRegion } from '@glass-frontier/utils';

import { S3WorldStateStore } from './s3WorldStateStore';
import { WorldIndexRepository } from './worldIndexRepository';
import type { WorldStateStore } from './worldStateStore';

type CreateWorldStateStoreOptions = {
  bucket?: string | null;
  client?: S3Client;
  dynamoClient?: DynamoDBClient;
  prefix?: string | null;
  region?: string;
  worldIndexTable?: string | null;
};

const resolveRequiredString = (
  explicit: string | null | undefined,
  fallback: string | null | undefined,
  errorMessage: string
): string => {
  const candidate = explicit ?? fallback ?? null;
  if (candidate !== null && candidate.trim().length > 0) {
    return candidate;
  }
  throw new Error(errorMessage);
};

const resolvePrefix = (options?: CreateWorldStateStoreOptions): string | undefined => {
  const candidate = options?.prefix ?? process.env.NARRATIVE_S3_PREFIX ?? null;
  return candidate !== null && candidate.trim().length > 0 ? candidate : undefined;
};

const resolveRegion = (options?: { region?: string }): string => {
  return options?.region ?? resolveAwsRegion();
};

const createWorldIndex = (
  tableName: string,
  region: string,
  dynamoClient?: DynamoDBClient
): WorldIndexRepository => {
  const endpoint = resolveAwsEndpoint('dynamodb');
  const client =
    dynamoClient ??
    new DynamoDBClient({
      endpoint,
      region,
    });
  return new WorldIndexRepository({
    client,
    tableName,
  });
};

export function createWorldStateStore(options?: CreateWorldStateStoreOptions): WorldStateStore {
  const region = resolveRegion(options);
  const bucket = resolveRequiredString(
    options?.bucket ?? null,
    process.env.NARRATIVE_S3_BUCKET ?? null,
    'World state store requires NARRATIVE_S3_BUCKET to be configured.'
  );
  const tableName = resolveRequiredString(
    options?.worldIndexTable ?? null,
    process.env.NARRATIVE_DDB_TABLE ?? null,
    'World state store requires NARRATIVE_DDB_TABLE to be configured.'
  );
  const worldIndex = createWorldIndex(tableName, region, options?.dynamoClient);

  return new S3WorldStateStore({
    bucket,
    client: options?.client,
    prefix: resolvePrefix(options),
    region,
    worldIndex,
  });
}
