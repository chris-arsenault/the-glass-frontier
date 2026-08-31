import { log } from '@glass-frontier/utils';

import { createPool } from '../pg';
import { seedCanon } from '../seedCanon';

const main = async (): Promise<void> => {
  const pool = createPool();
  try {
    const result = await seedCanon(pool);
    log('info', 'worldstate.canon-seeded', {
      batchId: result.batchId,
      classificationCount: result.classificationCount,
      encyclopediaCount: result.encyclopediaCount,
      entityCount: result.entityCount,
      loreCount: result.loreCount,
      relationshipCount: result.relationshipCount,
      sourceId: result.sourceId,
      status: result.status,
    });
  } finally {
    await pool.end();
  }
};

main().catch((error: unknown) => {
  log('error', 'worldstate.canon-seed-failed', {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
