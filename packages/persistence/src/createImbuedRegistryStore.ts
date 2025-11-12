import type { S3Client } from '@aws-sdk/client-s3';
import { S3ImbuedRegistryStore, type ImbuedRegistryStore } from './imbuedRegistryStore';

export interface CreateImbuedRegistryStoreOptions {
  bucket?: string | null;
  prefix?: string | null;
  client?: S3Client;
  region?: string;
}

export function createImbuedRegistryStore(
  options?: CreateImbuedRegistryStoreOptions
): ImbuedRegistryStore {
  const bucket = options?.bucket ?? process.env.NARRATIVE_S3_BUCKET ?? null;
  if (!bucket) {
    throw new Error('Imbued registry store requires NARRATIVE_S3_BUCKET to be configured.');
  }
  return new S3ImbuedRegistryStore({
    bucket,
    prefix: options?.prefix ?? process.env.NARRATIVE_S3_PREFIX ?? undefined,
    client: options?.client,
    region: options?.region,
  });
}
