import { log } from '@glass-frontier/utils';

import { createPool } from '../pg';
import { seedVocabulary } from '../seedVocabulary';

const main = async (): Promise<void> => {
  const pool = createPool();
  try {
    await seedVocabulary(pool);
    log('info', 'worldstate.vocabulary-seeded');
  } finally {
    await pool.end();
  }
};

main().catch((error: unknown) => {
  log('error', 'worldstate.vocabulary-seed-failed', {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
