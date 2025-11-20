import { createOpsStore } from '@glass-frontier/ops';
import { PromptTemplateManager, createWorldStateStore } from '@glass-frontier/worldstate';

const worldstateDatabaseUrl = process.env.WORLDSTATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (typeof worldstateDatabaseUrl !== 'string' || worldstateDatabaseUrl.trim().length === 0) {
  throw new Error('WORLDSTATE_DATABASE_URL must be configured for the prompt API.');
}

const worldStateStore = createWorldStateStore({
  connectionString: worldstateDatabaseUrl,
});

const templateManager = new PromptTemplateManager({ worldStateStore });

const opsStore = createOpsStore({ connectionString: worldstateDatabaseUrl });

export type Context = {
  auditFeedbackStore: typeof opsStore.auditFeedbackStore;
  auditLogStore: typeof opsStore.auditLogStore;
  auditReviewStore: typeof opsStore.auditReviewStore;
  authorizationHeader?: string;
  opsStore: typeof opsStore;
  templateManager: PromptTemplateManager;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    auditFeedbackStore: opsStore.auditFeedbackStore,
    auditLogStore: opsStore.auditLogStore,
    auditReviewStore: opsStore.auditReviewStore,
    authorizationHeader: options?.authorizationHeader,
    opsStore,
    templateManager,
  };
}
