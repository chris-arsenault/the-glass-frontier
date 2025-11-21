import { createAppStore, type PromptTemplateManager, type PlayerStore } from '@glass-frontier/app';
import { createOpsStore } from '@glass-frontier/ops';

const worldstateDatabaseUrl = process.env.GLASS_FRONTIER_DATABASE_URL;
if (typeof worldstateDatabaseUrl !== 'string' || worldstateDatabaseUrl.trim().length === 0) {
  throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured for the prompt API.');
}

const appStore = createAppStore({ connectionString: worldstateDatabaseUrl });
const templateManager = appStore.promptTemplateManager;
const opsStore = createOpsStore({ connectionString: worldstateDatabaseUrl });

export type Context = {
  auditFeedbackStore: typeof opsStore.auditFeedbackStore;
  auditLogStore: typeof opsStore.auditLogStore;
  auditReviewStore: typeof opsStore.auditReviewStore;
  authorizationHeader?: string;
  playerStore: PlayerStore;
  opsStore: typeof opsStore;
  templateManager: PromptTemplateManager;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    auditFeedbackStore: opsStore.auditFeedbackStore,
    auditLogStore: opsStore.auditLogStore,
    auditReviewStore: opsStore.auditReviewStore,
    authorizationHeader: options?.authorizationHeader,
    playerStore: appStore.playerStore,
    opsStore,
    templateManager,
  };
}
