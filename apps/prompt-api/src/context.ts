import { AuditFeedbackStore, AuditLogStore, AuditReviewStore } from '@glass-frontier/ops';
import { PromptTemplateManager, createWorldStateStore } from '@glass-frontier/worldstate';

const worldstateDatabaseUrl = process.env.WORLDSTATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (typeof worldstateDatabaseUrl !== 'string' || worldstateDatabaseUrl.trim().length === 0) {
  throw new Error('WORLDSTATE_DATABASE_URL must be configured for the prompt API.');
}

const worldStateStore = createWorldStateStore({
  connectionString: worldstateDatabaseUrl,
});

const templateManager = new PromptTemplateManager({ worldStateStore });

const auditLogStore = new AuditLogStore({ connectionString: worldstateDatabaseUrl });
const auditReviewStore = new AuditReviewStore({ connectionString: worldstateDatabaseUrl });
const auditFeedbackStore = new AuditFeedbackStore({ connectionString: worldstateDatabaseUrl });

export type Context = {
  auditFeedbackStore: AuditFeedbackStore;
  auditLogStore: AuditLogStore;
  auditReviewStore: AuditReviewStore;
  templateManager: PromptTemplateManager;
  authorizationHeader?: string;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    auditFeedbackStore,
    auditLogStore,
    auditReviewStore,
    authorizationHeader: options?.authorizationHeader,
    templateManager,
  };
}
