import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { S3Client } from "@aws-sdk/client-s3";
import { InMemoryWorldStateStore } from "./inMemoryWorldStateStore";
import { S3WorldStateStore } from "./s3WorldStateStore";
import type { WorldStateStore } from "./worldStateStore";
import { WorldIndexRepository } from "./worldIndexRepository";

export interface CreateWorldStateStoreOptions {
  bucket?: string | null;
  prefix?: string | null;
  client?: S3Client;
  region?: string;
  worldIndexTable?: string | null;
  dynamoClient?: DynamoDBClient;
}

export function createWorldStateStore(options?: CreateWorldStateStoreOptions): WorldStateStore {
  const bucket = options?.bucket ?? process.env.NARRATIVE_S3_BUCKET ?? null;
  if (!bucket) {
    return new InMemoryWorldStateStore();
  }

  const tableName = options?.worldIndexTable ?? process.env.NARRATIVE_DDB_TABLE ?? null;
  if (!tableName) {
    throw new Error("World state store requires a DynamoDB table when using S3 persistence.");
  }

  const region =
    options?.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";

  const dynamoClient =
    options?.dynamoClient ??
    new DynamoDBClient({
      region
    });

  const worldIndex = new WorldIndexRepository({
    client: dynamoClient,
    tableName
  });

  return new S3WorldStateStore({
    bucket,
    prefix: options?.prefix ?? process.env.NARRATIVE_S3_PREFIX ?? undefined,
    client: options?.client,
    region,
    worldIndex
  });
}
