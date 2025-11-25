// context.ts
import type { Pool } from 'pg';
import {
  createPoolWithIamAuth,
  useIamAuth,
  createPool,
} from '@glass-frontier/app';
import { WorldState } from '@glass-frontier/worldstate';

// Singleton instances - initialized lazily
let pool: Pool | undefined;
let worldState: WorldState | undefined;

/**
 * Initialize context for Lambda with IAM auth.
 * Call this once at cold start.
 */
export async function initializeForLambda(): Promise<void> {
  if (pool) return; // Already initialized

  pool = await createPoolWithIamAuth();
  worldState = WorldState.create({ pool });
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
  worldState = WorldState.create({ pool });
}

/**
 * Get the WorldState instance, initializing if needed for local development.
 */
export function getWorldState(): WorldState {
  // For local development, initialize synchronously on first call
  if (!pool && !useIamAuth()) {
    initializeLocal();
  }

  if (!worldState) {
    throw new Error(
      'WorldState not initialized. For Lambda, call initializeForLambda() at cold start.'
    );
  }

  return worldState;
}

export { useIamAuth };
