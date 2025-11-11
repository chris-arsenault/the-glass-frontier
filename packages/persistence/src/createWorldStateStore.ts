import type { S3Client } from "@aws-sdk/client-s3";
import { InMemoryWorldStateStore } from "./inMemoryWorldStateStore";
import { S3WorldStateStore } from "./s3WorldStateStore";
import type { WorldStateStore } from "./worldStateStore";

export interface CreateWorldStateStoreOptions {
  bucket?: string | null;
  prefix?: string | null;
  client?: S3Client;
  region?: string;
}

export function createWorldStateStore(options?: CreateWorldStateStoreOptions): WorldStateStore {
  const bucket = options?.bucket ?? process.env.NARRATIVE_S3_BUCKET ?? null;
  if (!bucket) {
    return new InMemoryWorldStateStore();
  }

  return new S3WorldStateStore({
    bucket,
    prefix: options?.prefix ?? process.env.NARRATIVE_S3_PREFIX ?? undefined,
    client: options?.client,
    region: options?.region
  });
}
