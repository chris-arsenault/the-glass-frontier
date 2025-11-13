import { createWorldStateStore, PromptTemplateManager } from '@glass-frontier/persistence';

const templateBucket = process.env.PROMPT_TEMPLATE_BUCKET;
if (typeof templateBucket !== 'string' || templateBucket.trim().length === 0) {
  throw new Error('PROMPT_TEMPLATE_BUCKET must be configured for the prompt API.');
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

export type Context = {
  templateManager: PromptTemplateManager;
  authorizationHeader?: string;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    authorizationHeader: options?.authorizationHeader,
    templateManager,
  };
}
