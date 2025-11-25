import { OpenAIProvider } from './providers/OpenAIProvider';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { BedrockProvider } from './providers/BedrockProvider';
import { ProviderRegistry } from './providers/ProviderRegistry';
import type { ModelConfigStore } from '@glass-frontier/app';

export async function syncRegistryToDatabase(
  registry: ProviderRegistry,
  modelConfigStore: ModelConfigStore
): Promise<void> {
  const models = registry.getAllModels();
  console.log(`[ModelRegistry] Syncing ${models.length} models to database...`);

  for (const model of models) {
    await modelConfigStore.upsertModel({
      modelId: model.modelId,
      apiModelId: model.apiModelId ?? null,
      displayName: model.displayName,
      providerId: model.providerId,
      isEnabled: true,
      maxTokens: model.maxTokens,
      costPer1kInput: model.costPer1kInput,
      costPer1kOutput: model.costPer1kOutput,
      supportsReasoning: model.supportsReasoning,
    });
  }

  console.log('[ModelRegistry] Sync complete');
}

export function createDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();

  registry.register(new OpenAIProvider());
  registry.register(new AnthropicProvider());
  registry.register(new BedrockProvider());

  registry.registerModel({
    modelId: 'gpt-5-nano',
    displayName: 'GPT-5 Nano',
    providerId: 'openai',
    maxTokens: 8192,
    costPer1kInput: 0.0001,
    costPer1kOutput: 0.0002,
    supportsReasoning: false,
  });

  registry.registerModel({
    modelId: 'gpt-5-mini',
    displayName: 'GPT-5 Mini',
    providerId: 'openai',
    maxTokens: 16384,
    costPer1kInput: 0.0002,
    costPer1kOutput: 0.0004,
    supportsReasoning: true,
  });

  registry.registerModel({
    modelId: 'gpt-4.1-mini',
    displayName: 'GPT-4.1 Mini',
    providerId: 'openai',
    maxTokens: 128000,
    costPer1kInput: 0.001,
    costPer1kOutput: 0.002,
    supportsReasoning: true,
  });

  registry.registerModel({
    modelId: 'claude-haiku-4.5',
    apiModelId: 'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku 4.5',
    providerId: 'anthropic',
    maxTokens: 200000,
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.004,
    supportsReasoning: false,
  });

  registry.registerModel({
    modelId: 'claude-sonnet-4.5',
    apiModelId: 'claude-sonnet-4-5-20250929',
    displayName: 'Claude Sonnet 4.5',
    providerId: 'anthropic',
    maxTokens: 200000,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    supportsReasoning: true,
  });

  registry.registerModel({
    modelId: 'us.amazon.nova-micro-v1:0',
    displayName: 'Amazon Nova Micro',
    providerId: 'bedrock',
    maxTokens: 128000,
    costPer1kInput: 0.000035,
    costPer1kOutput: 0.00014,
    supportsReasoning: false,
  });

  registry.registerModel({
    modelId: 'us.amazon.nova-lite-v1:0',
    displayName: 'Amazon Nova Lite',
    providerId: 'bedrock',
    maxTokens: 300000,
    costPer1kInput: 0.00006,
    costPer1kOutput: 0.00024,
    supportsReasoning: false,
  });

  registry.registerModel({
    modelId: 'us.amazon.nova-pro-v1:0',
    displayName: 'Amazon Nova Pro',
    providerId: 'bedrock',
    maxTokens: 300000,
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.0032,
    supportsReasoning: true,
  });

  return registry;
}
