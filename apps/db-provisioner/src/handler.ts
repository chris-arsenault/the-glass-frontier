import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { useRdsIamAuth, generateRdsIamToken } from '@glass-frontier/node-utils';
import { seedVocabulary } from '@glass-frontier/worldstate';
import type { Context } from 'aws-lambda';
import { runner as migrate } from 'node-pg-migrate';
import * as path from 'path';
import { Pool, type PoolConfig } from 'pg';

export type ProvisionerEvent = {
  action: 'migrate' | 'reset' | 'seed' | 'setup-iam-user';
  packages?: Array<'app' | 'ops' | 'worldstate'>;
};

type ProvisionerResult = {
  success: boolean;
  action: string;
  packages: string[];
  message: string;
  error?: string;
};

/**
 * Get master credentials from Secrets Manager
 */
const getMasterCredentials = async (): Promise<{ username: string; password: string }> => {
  const secretArn = process.env.RDS_MASTER_SECRET_ARN;
  if (!secretArn) {
    throw new Error('RDS_MASTER_SECRET_ARN environment variable is required');
  }

  console.log(`Fetching master credentials from: ${secretArn}`);

  const client = new SecretsManagerClient({});
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );

  if (!response.SecretString) {
    throw new Error('Failed to retrieve master credentials from Secrets Manager');
  }

  const secret = JSON.parse(response.SecretString) as Record<string, unknown>;
  console.log(`Secret keys: ${Object.keys(secret).join(', ')}`);

  const username = secret.username as string;
  const password = secret.password as string;

  if (!username || !password) {
    throw new Error(`Invalid secret format. Keys found: ${Object.keys(secret).join(', ')}`);
  }

  console.log(`Master username from secret: ${username}`);
  return { password, username };
};

/**
 * Create a pool using master credentials (for setup operations)
 */
const createMasterPool = async (database = 'postgres'): Promise<Pool> => {
  const host = process.env.PGHOST!;
  const port = parseInt(process.env.PGPORT || '5432', 10);
  const { password, username } = await getMasterCredentials();

  console.log(`Connecting to ${host}:${port}/${database} as ${username}`);

  const config: PoolConfig = {
    connectionTimeoutMillis: 10000,
    database,
    host,
    max: 1,
    password,
    port,
    ssl: { rejectUnauthorized: false },
    user: username,
  };

  const pool = new Pool(config);

  // Test the connection
  const client = await pool.connect();
  console.log(`Successfully connected to ${database}`);
  client.release();

  return pool;
};

/**
 * Create a pool using IAM auth or connection string
 */
const createPool = async (): Promise<Pool> => {
  if (useRdsIamAuth()) {
    const host = process.env.PGHOST!;
    const port = parseInt(process.env.PGPORT || '5432', 10);
    const database = process.env.PGDATABASE!;
    const user = process.env.PGUSER!;
    const password = await generateRdsIamToken();

    const config: PoolConfig = {
      database,
      host,
      max: 1,
      password,
      port,
      ssl: { rejectUnauthorized: false }, // RDS uses Amazon CA, IAM auth provides security
      user,
    };

    return new Pool(config);
  }

  // Local development
  const connectionString = process.env.GLASS_FRONTIER_DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured');
  }

  return new Pool({ connectionString, max: 1 });
};

const PACKAGE_CONFIGS: Record<string, { migrationsTable: string; migrationsDir: string }> = {
  app: {
    migrationsDir: 'packages/app/migrations',
    migrationsTable: 'app_migrations',
  },
  ops: {
    migrationsDir: 'packages/ops/migrations',
    migrationsTable: 'ops_migrations',
  },
  worldstate: {
    migrationsDir: 'packages/worldstate/migrations',
    migrationsTable: 'worldstate_migrations',
  },
};

const runMigrations = async (
  pool: Pool,
  packageName: string,
  direction: 'up' | 'down',
  count?: number
): Promise<void> => {
  const config = PACKAGE_CONFIGS[packageName];
  if (!config) {
    throw new Error(`Unknown package: ${packageName}`);
  }

  // For Lambda, migrations are bundled in the dist directory
  // LAMBDA_TASK_ROOT is /var/task in Lambda, and our migrations are at /var/task/packages/*/migrations/
  // For local, we're running from the apps/db-provisioner directory, so we need to go up to root
  const baseDir = process.env.LAMBDA_TASK_ROOT || path.join(process.cwd(), '../..');
  const migrationsDir = path.join(baseDir, config.migrationsDir);

  console.log(`[${packageName}] Running migrations ${direction} from ${migrationsDir}`);

  const client = await pool.connect();
  try {
    await migrate({
      count,
      dbClient: client,
      dir: migrationsDir,
      direction,
      log: (msg) => console.log(`[${packageName}] ${msg}`),
      migrationsTable: config.migrationsTable,
    });
    console.log(`[${packageName}] Migrations ${direction} completed`);
  } finally {
    client.release();
  }
};

const resetDatabase = async (pool: Pool, packages: string[]): Promise<void> => {
  console.log('Resetting database...');

  // Run down migrations in reverse order
  const reversedPackages = [...packages].reverse();
  for (const pkg of reversedPackages) {
    await runMigrations(pool, pkg, 'down', Infinity);
  }

  console.log('Database reset complete');
};

/**
 * Applies the world vocabulary from `@glass-frontier/dto`. Idempotent, and run
 * after every migration because the vocabulary tables are no longer seeded by
 * the migrations themselves.
 */
const seedDatabase = async (pool: Pool): Promise<void> => {
  console.log('Seeding world vocabulary...');
  await seedVocabulary(pool);
  console.log('World vocabulary seeded');
};

/**
 * Setup IAM authentication user in PostgreSQL.
 * This must be run once after creating the RDS instance.
 *
 * If the master user is the same as the IAM user, we just grant rds_iam.
 * If they're different, we create a new user with rds_iam role.
 */
const setupIamUser = async (): Promise<void> => {
  const iamUser = process.env.PGUSER;
  const database = process.env.PGDATABASE;

  if (!iamUser || !database) {
    throw new Error('PGUSER and PGDATABASE environment variables are required');
  }

  const { username: masterUser } = await getMasterCredentials();
  const isSameAsMaster = iamUser === masterUser;

  console.log(`Setting up IAM user: ${iamUser} for database: ${database}`);
  console.log(`Master user: ${masterUser}, IAM user same as master: ${isSameAsMaster}`);

  // Connect to postgres database as master user
  const masterPool = await createMasterPool('postgres');

  try {
    const client = await masterPool.connect();
    try {
      if (isSameAsMaster) {
        // The master user is also the IAM user - just grant rds_iam
        console.log(`Master user ${masterUser} is also the IAM user, granting rds_iam role`);
        await client.query(`GRANT rds_iam TO "${iamUser}"`);
      } else {
        // Check if user exists
        const userExists = await client.query(
          'SELECT 1 FROM pg_roles WHERE rolname = $1',
          [iamUser]
        );

        if (userExists.rows.length === 0) {
          console.log(`Creating user: ${iamUser}`);
          await client.query(`CREATE USER "${iamUser}"`);
        } else {
          console.log(`User ${iamUser} already exists`);
        }

        // Grant rds_iam role for IAM authentication
        console.log(`Granting rds_iam role to ${iamUser}`);
        await client.query(`GRANT rds_iam TO "${iamUser}"`);
      }

      // Check if database exists
      const dbExists = await client.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [database]
      );

      if (dbExists.rows.length === 0) {
        console.log(`Creating database: ${database}`);
        await client.query(`CREATE DATABASE "${database}"`);
      } else {
        console.log(`Database ${database} already exists`);
      }

      // Grant connect and all privileges on the database (only needed if different user)
      if (!isSameAsMaster) {
        console.log(`Granting privileges on database ${database} to ${iamUser}`);
        await client.query(`GRANT ALL PRIVILEGES ON DATABASE "${database}" TO "${iamUser}"`);
      }
    } finally {
      client.release();
    }
  } finally {
    await masterPool.end();
  }

  // Now connect to the target database and grant schema permissions (only if different user)
  if (!isSameAsMaster) {
    const dbPool = await createMasterPool(database);

    try {
      const client = await dbPool.connect();
      try {
        console.log(`Granting schema permissions on ${database} to ${iamUser}`);

        await client.query(`GRANT ALL ON SCHEMA public TO "${iamUser}"`);
        await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${iamUser}"`);
        await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${iamUser}"`);
        await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${iamUser}"`);
        await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${iamUser}"`);
      } finally {
        client.release();
      }
    } finally {
      await dbPool.end();
    }
  }

  console.log(`IAM user ${iamUser} setup complete`);
};

export const handler = async (
  event: ProvisionerEvent,
  context: Context
): Promise<ProvisionerResult> => {
  console.log('DB Provisioner invoked', { event, requestId: context.awsRequestId });

  const action = event.action || 'migrate';
  const packages = event.packages || ['app', 'ops', 'worldstate'];

  let pool: Pool | undefined;

  try {
    // setup-iam-user doesn't need the regular pool
    if (action === 'setup-iam-user') {
      await setupIamUser();
      return {
        action,
        message: 'IAM user setup completed successfully',
        packages: [],
        success: true,
      };
    }

    pool = await createPool();

    switch (action) {
    case 'migrate':
      console.log(`Running migrations for packages: ${packages.join(', ')}`);
      for (const pkg of packages) {
        await runMigrations(pool, pkg, 'up');
      }
      await seedDatabase(pool);
      return {
        action,
        message: `Migrations completed successfully for: ${packages.join(', ')}`,
        packages,
        success: true,
      };

    case 'reset':
      console.log(`Resetting database and running migrations for packages: ${packages.join(', ')}`);
      await resetDatabase(pool, packages);
      for (const pkg of packages) {
        await runMigrations(pool, pkg, 'up');
      }
      await seedDatabase(pool);
      return {
        action,
        message: `Database reset and migrations completed for: ${packages.join(', ')}`,
        packages,
        success: true,
      };

    case 'seed':
      console.log('Running migrations and seeding database');
      for (const pkg of packages) {
        await runMigrations(pool, pkg, 'up');
      }
      await seedDatabase(pool);
      return {
        action,
        message: 'Migrations and seeding completed successfully',
        packages,
        success: true,
      };

    default:
      return {
        action,
        message: `Unknown action: ${action}`,
        packages,
        success: false,
      };
    }
  } catch (error) {
    console.error('Provisioner error:', error);
    return {
      action,
      error: error instanceof Error ? error.message : String(error),
      message: 'Provisioner failed',
      packages,
      success: false,
    };
  } finally {
    if (pool) {
      await pool.end();
    }
  }
};
