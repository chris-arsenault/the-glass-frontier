import { CohereTextEmbeddingClient } from '@glass-frontier/llm-client/embeddings';
import { log } from '@glass-frontier/utils';
import { createEncyclopediaStore, createWorldSchemaStore } from '@glass-frontier/worldstate';
import { createLambdaPool } from '@glass-frontier/worldstate/pg';
import { seedCanon, type CanonSeedResult } from '@glass-frontier/worldstate/seedCanon';
import type { Handler } from 'aws-lambda';

import { embedMissingEncyclopediaEntries, embedMissingEntities } from './embedEntities';

type CanonSeedEvent = {
  operation: 'seed-canon';
};

const isCanonSeedEvent = (event: unknown): event is CanonSeedEvent =>
  typeof event === 'object' &&
  event !== null &&
  'operation' in event &&
  event.operation === 'seed-canon';

let pool: ReturnType<typeof createLambdaPool> | undefined;
const embeddings = new CohereTextEmbeddingClient();

const getPool = (): ReturnType<typeof createLambdaPool> => {
  pool ??= createLambdaPool();
  return pool;
};

export const handler: Handler<unknown, CanonSeedResult> = async (event) => {
  if (!isCanonSeedEvent(event)) {
    throw new Error('Canon seed Lambda accepts only the seed-canon operation.');
  }

  const result = await seedCanon(getPool());
  const embeddedEntityCount = await embedMissingEntities(
    createWorldSchemaStore({ pool: getPool() }),
    embeddings
  );
  const embeddedEncyclopediaCount = await embedMissingEncyclopediaEntries(
    createEncyclopediaStore({ pool: getPool() }),
    embeddings
  );
  log('info', 'canon-seed.completed', {
    batchId: result.batchId,
    embeddedEncyclopediaCount,
    embeddedEntityCount,
    entityCount: result.entityCount,
    loreCount: result.loreCount,
    relationshipCount: result.relationshipCount,
    sourceId: result.sourceId,
    status: result.status,
  });
  return result;
};
