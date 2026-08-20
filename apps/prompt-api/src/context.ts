import {
  createAppStore,
  type AppStore,
  type PromptTemplateManager,
  type PlayerStore,
  createPoolWithIamAuth,
  useIamAuth,
  createPool,
} from '@glass-frontier/app';
import { verifyAuthorizationHeader, type AuthorizedIdentity } from '@glass-frontier/node-utils';
import { createOpsStore, type OpsStore } from '@glass-frontier/ops';
// context.ts
import type { Pool } from 'pg';

export type Context = {
  auditFeedbackStore: OpsStore['auditFeedbackStore'];
  auditLogStore: OpsStore['auditLogStore'];
  auditReviewStore: OpsStore['auditReviewStore'];
  authorizationHeader?: string;
  identity: AuthorizedIdentity;
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
  if (pool !== undefined) {
    return;
  }

  pool = await createPoolWithIamAuth();

  appStore = createAppStore({ pool });
  opsStore = createOpsStore({ pool });
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
    throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured for the prompt API.');
  }

  pool = createPool({ connectionString });

  appStore = createAppStore({ pool });
  opsStore = createOpsStore({ pool });
}

export async function createContext(options?: { authorizationHeader?: string }): Promise<Context> {
  // For local development, initialize synchronously on first call
  if (pool === undefined && !useIamAuth()) {
    initializeLocal();
  }

  if (appStore === undefined || opsStore === undefined) {
    throw new Error(
      'Context not initialized. For Lambda, call initializeForLambda() at cold start.'
    );
  }

  const identity = await verifyAuthorizationHeader(options?.authorizationHeader);
  return {
    auditFeedbackStore: opsStore.auditFeedbackStore,
    auditLogStore: opsStore.auditLogStore,
    auditReviewStore: opsStore.auditReviewStore,
    authorizationHeader: options?.authorizationHeader,
    identity,
    opsStore,
    playerStore: appStore.playerStore,
    templateManager: appStore.promptTemplateManager,
  };
}
