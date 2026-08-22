import catalog from './modelCatalog.json';

export type ReasoningEffort = 'low' | 'medium' | 'high';
export type ModelProviderId = 'bedrock' | 'openai';

export type CatalogModel = {
  apiModelId: string;
  contextWindow: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  displayName: string;
  maxOutputTokens: number;
  modelId: string;
  providerId: ModelProviderId;
  reasoningEfforts: ReasoningEffort[];
};

export type ModelCatalog = {
  defaults: Record<'classification' | 'prose', string>;
  models: CatalogModel[];
};

export const MODEL_CATALOG = catalog as ModelCatalog;
