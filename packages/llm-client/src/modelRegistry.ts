import { MODEL_CATALOG } from '@glass-frontier/app';

import { AnthropicProvider } from './providers/AnthropicProvider';
import { BedrockProvider } from './providers/BedrockProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { ProviderRegistry } from './providers/ProviderRegistry';

export function createDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new OpenAIProvider());
  registry.register(new AnthropicProvider());
  registry.register(new BedrockProvider());
  for (const model of MODEL_CATALOG.models) {
    registry.registerModel(model);
  }
  return registry;
}
