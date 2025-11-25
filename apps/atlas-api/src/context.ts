// context.ts
import type { Pool } from 'pg';
import {
  createPoolWithIamAuth,
  useIamAuth,
  createPool,
} from '@glass-frontier/app';
import {
  createWorldSchemaStore,
  createChronicleStore,
  type WorldSchemaStore,
  type ChronicleStore,
} from '@glass-frontier/worldstate';

export type Context = {
  authorizationHeader?: string;
  worldSchemaStore: WorldSchemaStore;
  chronicleStore: ChronicleStore;
};

// Singleton instances - initialized lazily
let pool: Pool | undefined;
let worldSchemaStore: WorldSchemaStore | undefined;
let chronicleStore: ChronicleStore | undefined;

/**
 * Initialize context for Lambda with IAM auth.
 * Call this once at cold start.
 */
export async function initializeForLambda(): Promise<void> {
  if (pool) return; // Already initialized

  pool = await createPoolWithIamAuth();
  worldSchemaStore = createWorldSchemaStore({ pool });
  chronicleStore = createChronicleStore({ pool, worldStore: worldSchemaStore });
}

/**
 * Initialize context for local development with connection string.
 */
function initializeLocal(): void {
  if (pool) return; // Already initialized

  const connectionString = process.env.GLASS_FRONTIER_DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured for the atlas API.');
  }

  pool = createPool({ connectionString });
  worldSchemaStore = createWorldSchemaStore({ pool });
  chronicleStore = createChronicleStore({ pool, worldStore: worldSchemaStore });
}

/**
 * Create the tRPC context, initializing stores if needed for local development.
 */
export function createContext(options?: { authorizationHeader?: string }): Context {
  // For local development, initialize synchronously on first call
  if (!pool && !useIamAuth()) {
    initializeLocal();
  }

  if (!worldSchemaStore || !chronicleStore) {
    throw new Error(
      'Context not initialized. For Lambda, call initializeForLambda() at cold start.'
    );
  }

  return {
    authorizationHeader: options?.authorizationHeader,
    worldSchemaStore,
    chronicleStore,
  };
}

export { useIamAuth };
