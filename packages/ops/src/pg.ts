import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { useRdsIamAuth, generateRdsIamToken } from '@glass-frontier/node-utils';

const DEFAULT_CONNECTION_STRING = 'postgres://postgres:postgres@localhost:5432/worldstate';

export type PgOptions = {
  pool?: Pool;
  connectionString?: string;
};

/**
 * Check if we should use IAM authentication (Lambda environment)
 */
export const useIamAuth = useRdsIamAuth;

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
 * Create a connection pool for Lambda with IAM authentication.
 * Call this once at Lambda cold start and pass the pool to stores.
 */
export const createPoolWithIamAuth = async (): Promise<Pool> => {
  const host = process.env.PGHOST!;
  const port = parseInt(process.env.PGPORT || '5432', 10);
  const database = process.env.PGDATABASE!;
  const user = process.env.PGUSER!;
  const password = await generateRdsIamToken();

  const config: PoolConfig = {
    host,
    port,
    database,
    user,
    password,
    ssl: { rejectUnauthorized: false }, // RDS uses Amazon CA, IAM auth provides security
    max: 1, // Lambda should use minimal connections since RDS Proxy handles pooling
  };

  return new Pool(config);
};

/**
 * Create a connection pool.
 *
 * For local development: Works synchronously with connection string.
 * For Lambda: If RDS_IAM_AUTH=true and no pool is provided, throws an error.
 *             Use createPoolWithIamAuth() at Lambda cold start instead.
 */
export const createPool = (options?: PgOptions): Pool => {
  if (options?.pool) {
    return options.pool;
  }

  if (useIamAuth()) {
    throw new Error(
      'Cannot create pool synchronously with IAM auth. ' +
        'Use createPoolWithIamAuth() at Lambda cold start and pass the pool to stores.'
    );
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
