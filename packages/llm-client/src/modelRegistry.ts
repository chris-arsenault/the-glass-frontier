import type { ModelConfigStore } from '@glass-frontier/app';

import { AnthropicProvider } from './providers/AnthropicProvider';
import { BedrockProvider } from './providers/BedrockProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { ProviderRegistry, type ModelConfig } from './providers/ProviderRegistry';

const DEFAULT_MODELS: ModelConfig[] = [
  {
    costPer1kInput: 0.0001, costPer1kOutput: 0.0002,
    displayName: 'GPT-5 Nano', maxTokens: 8192, modelId: 'gpt-5-nano',
    providerId: 'openai', supportsReasoning: false,
  },
  {
    costPer1kInput: 0.0002, costPer1kOutput: 0.0004,
    displayName: 'GPT-5 Mini', maxTokens: 16_384, modelId: 'gpt-5-mini',
    providerId: 'openai', supportsReasoning: true,
  },
  {
    costPer1kInput: 0.001, costPer1kOutput: 0.002,
    displayName: 'GPT-4.1 Mini', maxTokens: 128_000, modelId: 'gpt-4.1-mini',
    providerId: 'openai', supportsReasoning: true,
  },
  {
    apiModelId: 'claude-haiku-4-5-20251001',
    costPer1kInput: 0.0008, costPer1kOutput: 0.004,
    displayName: 'Claude Haiku 4.5', maxTokens: 200_000, modelId: 'claude-haiku-4.5',
    providerId: 'anthropic', supportsReasoning: false,
  },
  {
    apiModelId: 'claude-sonnet-4-5-20250929',
    costPer1kInput: 0.003, costPer1kOutput: 0.015,
    displayName: 'Claude Sonnet 4.5', maxTokens: 200_000, modelId: 'claude-sonnet-4.5',
    providerId: 'anthropic', supportsReasoning: true,
  },
  {
    costPer1kInput: 0.000035, costPer1kOutput: 0.00014,
    displayName: 'Amazon Nova Micro', maxTokens: 128_000,
    modelId: 'us.amazon.nova-micro-v1:0', providerId: 'bedrock', supportsReasoning: false,
  },
  {
    costPer1kInput: 0.00006, costPer1kOutput: 0.00024,
    displayName: 'Amazon Nova Lite', maxTokens: 300_000,
    modelId: 'us.amazon.nova-lite-v1:0', providerId: 'bedrock', supportsReasoning: false,
  },
  {
    costPer1kInput: 0.0008, costPer1kOutput: 0.0032,
    displayName: 'Amazon Nova Pro', maxTokens: 300_000,
    modelId: 'us.amazon.nova-pro-v1:0', providerId: 'bedrock', supportsReasoning: true,
  },
];

export async function syncRegistryToDatabase(
  registry: ProviderRegistry,
  modelConfigStore: ModelConfigStore
): Promise<void> {
  const models = registry.getAllModels();
  console.log(`[ModelRegistry] Syncing ${models.length} models to database...`);
  await Promise.all(models.map(async (model) => modelConfigStore.upsertModel({
    apiModelId: model.apiModelId ?? null,
    costPer1kInput: model.costPer1kInput,
    costPer1kOutput: model.costPer1kOutput,
    displayName: model.displayName,
    isEnabled: true,
    maxTokens: model.maxTokens,
    modelId: model.modelId,
    providerId: model.providerId,
    supportsReasoning: model.supportsReasoning,
  })));
  console.log('[ModelRegistry] Sync complete');
}

export function createDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new OpenAIProvider());
  registry.register(new AnthropicProvider());
  registry.register(new BedrockProvider());
  for (const model of DEFAULT_MODELS) {
    registry.registerModel(model);
  }
  return registry;
}
