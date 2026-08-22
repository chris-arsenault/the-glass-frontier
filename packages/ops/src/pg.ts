import {
  isLambdaRuntime,
  resolveLambdaDatabaseEnvironment,
} from '@glass-frontier/node-utils';
import { Pool, type PoolClient, type PoolConfig } from 'pg';

const DEFAULT_CONNECTION_STRING = 'postgres://postgres:postgres@localhost:5432/worldstate';

export type PgOptions = {
  pool?: Pool;
  connectionString?: string;
};

export const useLambdaRuntime = isLambdaRuntime;

/**
 * Resolve connection string for local development
 */
export const resolveConnectionString = (options?: PgOptions): string => {
  const candidate =
    options?.connectionString ?? process.env.GLASS_FRONTIER_DATABASE_URL ?? DEFAULT_CONNECTION_STRING;
  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    throw new Error('GLASS_FRONTIER_DATABASE_URL is required for the ops store.');
  }
  return trimmed;
};

/**
 * Create a connection pool for Lambda with Ahara's project database credentials.
 * Call this once at Lambda cold start and pass the pool to stores.
 */
export const createLambdaPool = (): Pool => {
  const { database, host, password, port, user } = resolveLambdaDatabaseEnvironment();

  const config: PoolConfig = {
    database,
    host,
    max: 1,
    password,
    port,
    ssl: { rejectUnauthorized: false },
    user,
  };

  return new Pool(config);
};

/**
 * Create a connection pool.
 *
 * For local development: Works synchronously with connection string.
 * For Lambda, use createLambdaPool() at cold start so each execution
 * environment holds at most one shared-RDS connection.
 */
export const createPool = (options?: PgOptions): Pool => {
  if (options?.pool !== undefined) {
    return options.pool;
  }

  if (useLambdaRuntime()) {
    throw new Error('Use createLambdaPool() at Lambda cold start and pass the pool to stores.');
  }

  // Local development - use connection string
  return new Pool({
    connectionString: resolveConnectionString(options),
    max: 10,
  });
};

export const withTransaction = async <T>(
  pool: Pool,
  handler: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
