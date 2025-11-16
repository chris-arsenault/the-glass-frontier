import {
  AuditFeedbackStore,
  AuditLogStore,
  AuditModerationStore,
} from '@glass-frontier/persistence';
import { DynamoWorldStateStore } from '@glass-frontier/worldstate/persistence';
import { createAwsDynamoClient, createAwsS3Client } from '@glass-frontier/node-utils';

import { PromptTemplateManager } from './templateManager/PromptTemplateManager';

const templateBucket = process.env.PROMPT_TEMPLATE_BUCKET;
if (typeof templateBucket !== 'string' || templateBucket.trim().length === 0) {
  throw new Error('PROMPT_TEMPLATE_BUCKET must be configured for the prompt API.');
}

const auditBucket = process.env.LLM_PROXY_ARCHIVE_BUCKET;
if (typeof auditBucket !== 'string' || auditBucket.trim().length === 0) {
  throw new Error('LLM_PROXY_ARCHIVE_BUCKET must be configured for the audit review API.');
}

const worldStateBucket = process.env.WORLD_STATE_S3_BUCKET;
if (typeof worldStateBucket !== 'string' || worldStateBucket.trim().length === 0) {
  throw new Error('WORLD_STATE_S3_BUCKET must be configured for the prompt API.');
}

const worldStateTable = process.env.WORLD_STATE_TABLE_NAME;
if (typeof worldStateTable !== 'string' || worldStateTable.trim().length === 0) {
  throw new Error('WORLD_STATE_TABLE_NAME must be configured for the prompt API.');
}

const worldStateStore = new DynamoWorldStateStore({
  bucketName: worldStateBucket.trim(),
  tableName: worldStateTable.trim(),
  s3Prefix: process.env.WORLD_STATE_S3_PREFIX ?? undefined,
  dynamoClient: createAwsDynamoClient(),
  s3Client: createAwsS3Client(),
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
