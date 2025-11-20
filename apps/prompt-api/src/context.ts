import {
  AuditFeedbackStore,
  AuditLogStore,
  AuditModerationStore,
  PromptTemplateManager,
  createWorldStateStore,
} from '@glass-frontier/worldstate';

const auditBucket = process.env.LLM_PROXY_ARCHIVE_BUCKET;
if (typeof auditBucket !== 'string' || auditBucket.trim().length === 0) {
  throw new Error('LLM_PROXY_ARCHIVE_BUCKET must be configured for the audit review API.');
}

const worldstateDatabaseUrl = process.env.WORLDSTATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (typeof worldstateDatabaseUrl !== 'string' || worldstateDatabaseUrl.trim().length === 0) {
  throw new Error('WORLDSTATE_DATABASE_URL must be configured for the prompt API.');
}

const worldStateStore = createWorldStateStore({
  connectionString: worldstateDatabaseUrl,
});

const templateManager = new PromptTemplateManager({ worldStateStore });

const auditLogStore = new AuditLogStore({
  bucket: auditBucket.trim(),
  prefix: process.env.LLM_PROXY_ARCHIVE_PREFIX ?? undefined,
});

const auditModerationStore = new AuditModerationStore({
  bucket: auditBucket.trim(),
  prefix: process.env.LLM_PROXY_ARCHIVE_PREFIX ?? undefined,
});

const auditFeedbackStore = new AuditFeedbackStore({
  bucket: auditBucket.trim(),
  prefix: process.env.LLM_PROXY_ARCHIVE_PREFIX ?? undefined,
});

export type Context = {
  auditFeedbackStore: AuditFeedbackStore;
  auditLogStore: AuditLogStore;
  auditModerationStore: AuditModerationStore;
  templateManager: PromptTemplateManager;
  authorizationHeader?: string;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    auditFeedbackStore,
    auditLogStore,
    auditModerationStore,
    authorizationHeader: options?.authorizationHeader,
    templateManager,
  };
}
