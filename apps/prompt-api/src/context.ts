import {
  AuditFeedbackStore,
  AuditLogStore,
  AuditModerationStore,
  createWorldStateStore,
  PromptTemplateManager,
} from '@glass-frontier/persistence';

const templateBucket = process.env.PROMPT_TEMPLATE_BUCKET;
if (typeof templateBucket !== 'string' || templateBucket.trim().length === 0) {
  throw new Error('PROMPT_TEMPLATE_BUCKET must be configured for the prompt API.');
}

const auditBucket = process.env.LLM_PROXY_ARCHIVE_BUCKET;
if (typeof auditBucket !== 'string' || auditBucket.trim().length === 0) {
  throw new Error('LLM_PROXY_ARCHIVE_BUCKET must be configured for the audit review API.');
}

const worldStateStore = createWorldStateStore({
  bucket: process.env.NARRATIVE_S3_BUCKET,
  prefix: process.env.NARRATIVE_S3_PREFIX ?? undefined,
  worldIndexTable: process.env.NARRATIVE_DDB_TABLE,
});

const templateManager = new PromptTemplateManager({
  bucket: templateBucket.trim(),
  worldStateStore,
});

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
