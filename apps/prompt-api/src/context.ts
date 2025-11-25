// context.ts
import type { Pool } from 'pg';
import {
  createAppStore,
  type AppStore,
  type PromptTemplateManager,
  type PlayerStore,
  createPoolWithIamAuth,
  useIamAuth,
  createPool,
} from '@glass-frontier/app';
import { createOpsStore, type OpsStore } from '@glass-frontier/ops';

export type Context = {
  auditFeedbackStore: OpsStore['auditFeedbackStore'];
  auditLogStore: OpsStore['auditLogStore'];
  auditReviewStore: OpsStore['auditReviewStore'];
  authorizationHeader?: string;
  playerStore: PlayerStore;
  opsStore: OpsStore;
  templateManager: PromptTemplateManager;
};

// Singleton instances - initialized lazily
let pool: Pool | undefined;
let appStore: AppStore | undefined;
let opsStore: OpsStore | undefined;

/**
 * Initialize context for Lambda with IAM auth.
 * Call this once at cold start.
 */
export async function initializeForLambda(): Promise<void> {
  if (pool) return; // Already initialized

  pool = await createPoolWithIamAuth();

  appStore = createAppStore({ pool });
  opsStore = createOpsStore({ pool });
}

/**
 * Initialize context for local development with connection string.
 */
function initializeLocal(): void {
  if (pool) return; // Already initialized

  const connectionString = process.env.GLASS_FRONTIER_DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured for the prompt API.');
  }

  pool = createPool({ connectionString });

  appStore = createAppStore({ pool });
  opsStore = createOpsStore({ pool });
}

export function createContext(options?: { authorizationHeader?: string }): Context {
  // For local development, initialize synchronously on first call
  if (!pool && !useIamAuth()) {
    initializeLocal();
  }

  if (!appStore || !opsStore) {
    throw new Error(
      'Context not initialized. For Lambda, call initializeForLambda() at cold start.'
    );
  }

  return {
    auditFeedbackStore: opsStore.auditFeedbackStore,
    auditLogStore: opsStore.auditLogStore,
    auditReviewStore: opsStore.auditReviewStore,
    authorizationHeader: options?.authorizationHeader,
    playerStore: appStore.playerStore,
    opsStore,
    templateManager: appStore.promptTemplateManager,
  };
}
