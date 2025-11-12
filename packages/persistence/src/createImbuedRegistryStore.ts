'use strict';

import type { S3Client } from '@aws-sdk/client-s3';

import { S3ImbuedRegistryStore, type ImbuedRegistryStore } from './imbuedRegistryStore';

type CreateImbuedRegistryStoreOptions = {
  bucket?: string | null;
  client?: S3Client;
  prefix?: string | null;
  region?: string;
};

const normalizeBucket = (explicit?: string | null): string => {
  const candidate = explicit ?? process.env.NARRATIVE_S3_BUCKET ?? null;
  if (candidate !== null && candidate.trim().length > 0) {
    return candidate;
  }
  throw new Error('Imbued registry store requires NARRATIVE_S3_BUCKET to be configured.');
};

const resolvePrefix = (explicit?: string | null): string | undefined => {
  const candidate = explicit ?? process.env.NARRATIVE_S3_PREFIX ?? null;
  return candidate !== null && candidate.trim().length > 0 ? candidate : undefined;
};

export function createImbuedRegistryStore(
  options?: CreateImbuedRegistryStoreOptions
): ImbuedRegistryStore {
  const bucket = normalizeBucket(options?.bucket ?? null);
  return new S3ImbuedRegistryStore({
    bucket,
    client: options?.client,
    prefix: resolvePrefix(options?.prefix ?? null),
    region: options?.region,
  });
}
