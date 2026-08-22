import {
  createLambdaPool,
  useLambdaRuntime,
  createPool,
} from '@glass-frontier/app';
import { verifyAuthorizationHeader, type AuthorizedIdentity } from '@glass-frontier/node-utils';
import {
  createWorldSchemaStore,
  type WorldSchemaStore,
} from '@glass-frontier/worldstate';
// context.ts
import type { Pool } from 'pg';

export type Context = {
  authorizationHeader?: string;
  identity: AuthorizedIdentity;
  worldSchemaStore: WorldSchemaStore;
};

// Singleton instances - initialized lazily
let pool: Pool | undefined;
let worldSchemaStore: WorldSchemaStore | undefined;

/**
 * Initialize context for the Lambda runtime.
 * Call this once at cold start.
 */
export function initializeForLambda(): Promise<void> {
  if (pool !== undefined) {
    return Promise.resolve();
  }

  pool = createLambdaPool();
  worldSchemaStore = createWorldSchemaStore({ pool });
  return Promise.resolve();
}

/**
 * Initialize context for local development with connection string.
 */
function initializeLocal(): void {
  if (pool !== undefined) {
    return;
  }

  const connectionString = process.env.GLASS_FRONTIER_DATABASE_URL;
  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured for the world-schema API.');
  }

  pool = createPool({ connectionString });
  worldSchemaStore = createWorldSchemaStore({ pool });
}

/**
 * Create the tRPC context, initializing stores if needed for local development.
 */
export async function createContext(options?: { authorizationHeader?: string }): Promise<Context> {
  // For local development, initialize synchronously on first call
  if (pool === undefined && !useLambdaRuntime()) {
    initializeLocal();
  }

  if (worldSchemaStore === undefined) {
    throw new Error(
      'Context not initialized. For Lambda, call initializeForLambda() at cold start.'
    );
  }

  const identity = await verifyAuthorizationHeader(options?.authorizationHeader);
  return {
    authorizationHeader: options?.authorizationHeader,
    identity,
    worldSchemaStore,
  };
}

export { useLambdaRuntime };
