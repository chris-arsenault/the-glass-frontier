// context.ts
import type { Pool } from 'pg';
import {
  createPoolWithIamAuth,
  useIamAuth,
  createPool,
} from '@glass-frontier/app';
import {
  createWorldSchemaStore,
  type WorldSchemaStore,
} from '@glass-frontier/worldstate';

export type Context = {
  authorizationHeader?: string;
  worldSchemaStore: WorldSchemaStore;
};

// Singleton instances - initialized lazily
let pool: Pool | undefined;
let worldSchemaStore: WorldSchemaStore | undefined;

/**
 * Initialize context for Lambda with IAM auth.
 * Call this once at cold start.
 */
export async function initializeForLambda(): Promise<void> {
  if (pool) return; // Already initialized

  pool = await createPoolWithIamAuth();
  worldSchemaStore = createWorldSchemaStore({ pool });
}

/**
 * Initialize context for local development with connection string.
 */
function initializeLocal(): void {
  if (pool) return; // Already initialized

  const connectionString = process.env.GLASS_FRONTIER_DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured for the world-schema API.');
  }

  pool = createPool({ connectionString });
  worldSchemaStore = createWorldSchemaStore({ pool });
}

/**
 * Create the tRPC context, initializing stores if needed for local development.
 */
export function createContext(options?: { authorizationHeader?: string }): Context {
  // For local development, initialize synchronously on first call
  if (!pool && !useIamAuth()) {
    initializeLocal();
  }

  if (!worldSchemaStore) {
    throw new Error(
      'Context not initialized. For Lambda, call initializeForLambda() at cold start.'
    );
  }

  return {
    authorizationHeader: options?.authorizationHeader,
    worldSchemaStore,
  };
}

export { useIamAuth };
