import { execa } from 'execa';
import { Pool } from 'pg';

const connectionString =
  process.env.GLASS_FRONTIER_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/worldstate';

const log = (...args: unknown[]) => {
  console.log('[drop-database]', ...args);
};

async function isDockerCompose(): Promise<boolean> {
  try {
    const result = await execa('docker-compose', [
      '-f',
      'docker-compose.e2e.yml',
      'ps',
      '-q',
      'postgres',
    ]);
    return result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function dropDatabaseViaDocker() {
  log('Detected Docker Compose setup');
  log('Stopping and removing postgres container with volumes...');

  try {
    // Stop and remove the postgres container with its volumes
    await execa(
      'docker-compose',
      ['-f', 'docker-compose.e2e.yml', 'down', '-v', 'postgres'],
      { stdio: 'inherit' }
    );

    log('✓ Database container and volumes removed');
    log('Run "pnpm local" to start fresh');
  } catch (error) {
    log('Error during docker cleanup:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function dropDatabaseDirect() {
  log('Connecting to database...');
  const pool = new Pool({ connectionString });

  try {
    log('WARNING: This will drop ALL schemas and data!');
    log('Dropping schemas: app, ops, public...');

    // Drop all schemas with CASCADE to remove all objects
    await pool.query('DROP SCHEMA IF EXISTS app CASCADE');
    log('✓ Dropped app schema');

    await pool.query('DROP SCHEMA IF EXISTS ops CASCADE');
    log('✓ Dropped ops schema');

    // Drop all tables/objects in public schema but keep the schema itself
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await pool.query('GRANT ALL ON SCHEMA public TO postgres');
    await pool.query('GRANT ALL ON SCHEMA public TO public');
    log('✓ Dropped and recreated public schema');

    log('✓ Database dropped successfully');
    log('Run "pnpm db:migrate" to recreate schemas and tables');
  } catch (error) {
    log('Error during database drop:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await pool.end();
  }
}

async function dropDatabase() {
  const useDocker = await isDockerCompose();

  if (useDocker) {
    await dropDatabaseViaDocker();
  } else {
    await dropDatabaseDirect();
  }
}

dropDatabase().catch((error) => {
  console.error('[drop-database] Failed', error);
  process.exit(1);
});
