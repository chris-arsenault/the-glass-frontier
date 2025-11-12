'use strict';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { S3Client } from '@aws-sdk/client-s3';

import { LocationGraphIndexRepository } from './locationGraphIndexRepository';
import type { LocationGraphStore } from './locationGraphStore';
import { S3LocationGraphStore } from './s3LocationGraphStore';

type CreateLocationGraphStoreOptions = {
  bucket?: string | null;
  client?: S3Client;
  dynamoClient?: DynamoDBClient;
  indexTable?: string | null;
  prefix?: string | null;
  region?: string;
};

const resolveMandatoryString = (
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

const resolveRegion = (options?: { region?: string }): string => {
  return (
    options?.region ??
    process.env.AWS_REGION ??
    process.env.AWS_DEFAULT_REGION ??
    'us-east-1'
  );
};

const resolveBucket = (options?: CreateLocationGraphStoreOptions): string =>
  resolveMandatoryString(
    options?.bucket ?? null,
    process.env.NARRATIVE_S3_BUCKET ?? null,
    'Location graph store requires NARRATIVE_S3_BUCKET to be configured.'
  );

const resolveTableName = (options?: CreateLocationGraphStoreOptions): string =>
  resolveMandatoryString(
    options?.indexTable ?? null,
    process.env.LOCATION_GRAPH_DDB_TABLE ?? null,
    'Location graph store requires LOCATION_GRAPH_DDB_TABLE to be configured.'
  );

const resolvePrefix = (options?: CreateLocationGraphStoreOptions): string | undefined => {
  const candidate = options?.prefix ?? process.env.NARRATIVE_S3_PREFIX ?? null;
  return candidate !== null && candidate.trim().length > 0 ? candidate : undefined;
};

const createIndexRepository = (
  tableName: string,
  region: string,
  dynamoClient?: DynamoDBClient
): LocationGraphIndexRepository => {
  const client = dynamoClient ?? new DynamoDBClient({ region });
  return new LocationGraphIndexRepository({
    client,
    tableName,
  });
};

export function createLocationGraphStore(
  options?: CreateLocationGraphStoreOptions
): LocationGraphStore {
  const region = resolveRegion(options);
  const bucket = resolveBucket(options);
  const tableName = resolveTableName(options);
  const index = createIndexRepository(tableName, region, options?.dynamoClient);

  return new S3LocationGraphStore({
    bucket,
    client: options?.client,
    index,
    prefix: resolvePrefix(options),
    region,
  });
}
