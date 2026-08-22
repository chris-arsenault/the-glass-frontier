import { log } from '@glass-frontier/utils';
import { createLambdaPool } from '@glass-frontier/worldstate/pg';
import { seedCanon, type CanonSeedResult } from '@glass-frontier/worldstate/seedCanon';
import type { Handler } from 'aws-lambda';

type CanonSeedEvent = {
  operation: 'seed-canon';
};

const isCanonSeedEvent = (event: unknown): event is CanonSeedEvent =>
  typeof event === 'object' &&
  event !== null &&
  'operation' in event &&
  event.operation === 'seed-canon';

let pool: ReturnType<typeof createLambdaPool> | undefined;

const getPool = (): ReturnType<typeof createLambdaPool> => {
  pool ??= createLambdaPool();
  return pool;
};

export const handler: Handler<unknown, CanonSeedResult> = async (event) => {
  if (!isCanonSeedEvent(event)) {
    throw new Error('Canon seed Lambda accepts only the seed-canon operation.');
  }

  const result = await seedCanon(getPool());
  log('info', 'canon-seed.completed', {
    batchId: result.batchId,
    entityCount: result.entityCount,
    loreCount: result.loreCount,
    relationshipCount: result.relationshipCount,
    sourceId: result.sourceId,
    status: result.status,
  });
  return result;
};
