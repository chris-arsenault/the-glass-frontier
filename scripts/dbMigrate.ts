import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

/**
 * The one migration runner.
 *
 * `db/migrations` is the only schema source of truth in this repository: the
 * deploy applies it through the shared Ahara migrate Lambda
 * (`.github/workflows/ci.yml`), and local development and the test harness
 * apply it through here. A schema change that is not in this directory does not
 * reach production, and a schema the tests pass against is the schema
 * production runs.
 *
 * Production's applied-migration ledger belongs to the Ahara migrate Lambda.
 * This runner keeps its own ledger for the databases it owns — the local
 * development database and the ephemeral test databases — so it must not be
 * pointed at the deployed database.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');
export const SEED_DIR = path.join(MIGRATIONS_DIR, 'seed');

const LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migration (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

const sqlFilesIn = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
};

/**
 * Applies every unapplied migration, oldest first, one transaction per file.
 * Returns the filenames it ran.
 */
export const applyMigrations = async (pool: Pool): Promise<string[]> => {
  await pool.query(LEDGER);
  const applied = await pool.query<{ filename: string }>(
    'SELECT filename FROM schema_migration'
  );
  const done = new Set(applied.rows.map((row) => row.filename));
  const pending = (await sqlFilesIn(MIGRATIONS_DIR)).filter((name) => !done.has(name));

  for (const filename of pending) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migration (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${filename} failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  return pending;
};

/**
 * Applies the bootstrap seed — application configuration and world vocabulary.
 * The deploy runs the same files through the migrate Lambda's `seed` operation,
 * and they are written to be idempotent, so this re-runs on every invocation.
 */
export const applySeed = async (pool: Pool): Promise<string[]> => {
  const files = await sqlFilesIn(SEED_DIR);
  for (const filename of files) {
    const sql = await readFile(path.join(SEED_DIR, filename), 'utf8');
    await pool.query(sql);
  }
  return files;
};

const resolveConnectionString = (): string => {
  const connectionString =
    process.env.GLASS_FRONTIER_DATABASE_URL ?? process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new Error('GLASS_FRONTIER_DATABASE_URL must be set');
  }
  return connectionString;
};

const main = async (): Promise<void> => {
  const pool = new Pool({ connectionString: resolveConnectionString() });
  try {
    const migrations = await applyMigrations(pool);
    console.log(
      migrations.length === 0
        ? '[db-migrate] schema already up to date'
        : `[db-migrate] applied ${migrations.join(', ')}`
    );
    const seeds = await applySeed(pool);
    console.log(`[db-migrate] seeded ${seeds.join(', ')}`);
  } finally {
    await pool.end();
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error('[db-migrate]', error);
    process.exitCode = 1;
  });
}
