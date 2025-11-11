import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { S3Client } from "@aws-sdk/client-s3";
import { S3LocationGraphStore } from "./s3LocationGraphStore";
import type { LocationGraphStore } from "./locationGraphStore";
import { LocationGraphIndexRepository } from "./locationGraphIndexRepository";

export interface CreateLocationGraphStoreOptions {
  bucket?: string | null;
  prefix?: string | null;
  client?: S3Client;
  region?: string;
  indexTable?: string | null;
  dynamoClient?: DynamoDBClient;
}

export function createLocationGraphStore(
  options?: CreateLocationGraphStoreOptions
): LocationGraphStore {
  const bucket = options?.bucket ?? process.env.NARRATIVE_S3_BUCKET ?? null;
  if (!bucket) {
    throw new Error("Location graph store requires NARRATIVE_S3_BUCKET to be configured.");
  }

  const tableName = options?.indexTable ?? process.env.LOCATION_GRAPH_DDB_TABLE ?? null;
  if (!tableName) {
    throw new Error("Location graph store requires LOCATION_GRAPH_DDB_TABLE to be configured.");
  }

  const region =
    options?.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";

  const dynamoClient =
    options?.dynamoClient ??
    new DynamoDBClient({
      region
    });

  const index = new LocationGraphIndexRepository({
    client: dynamoClient,
    tableName
  });

  return new S3LocationGraphStore({
    bucket,
    prefix: options?.prefix ?? process.env.NARRATIVE_S3_PREFIX ?? undefined,
    client: options?.client,
    region,
    index
  });
}
