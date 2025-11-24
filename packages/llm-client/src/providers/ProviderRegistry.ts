import { IProvider } from './IProvider';

export type ModelConfig = {
  modelId: string;
  apiModelId?: string;
  displayName: string;
  providerId: string;
  maxTokens: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  supportsReasoning: boolean;
};

export class ProviderRegistry {
  readonly #providers = new Map<string, IProvider>();
  readonly #models = new Map<string, ModelConfig>();
  readonly #apiModelMap = new Map<string, string>(); // Maps user-facing modelId -> API modelId

  register(provider: IProvider): void {
    if (this.#providers.has(provider.id)) {
      throw new Error(`Provider ${provider.id} already registered`);
    }
    this.#providers.set(provider.id, provider);
  }

  registerModel(config: ModelConfig): void {
    if (this.#models.has(config.modelId)) {
      throw new Error(`Model ${config.modelId} already registered`);
    }
    this.#models.set(config.modelId, config);

    // Map apiModelId -> providerId for provider lookup
    if (config.apiModelId) {
      this.#apiModelMap.set(config.apiModelId, config.modelId);
    }
  }

  getProvider(modelId: string): IProvider {
    // Try to find by user-facing modelId first, then by API modelId
    let config = this.#models.get(modelId);

    if (!config) {
      // Check if this is an API model ID that maps to a user-facing ID
      const userFacingId = this.#apiModelMap.get(modelId);
      if (userFacingId) {
        config = this.#models.get(userFacingId);
      }
    }

    if (!config) {
      console.error('[ProviderRegistry] Model not registered:', modelId);
      console.error('[ProviderRegistry] Available models:', Array.from(this.#models.keys()));
      console.error('[ProviderRegistry] Available API models:', Array.from(this.#apiModelMap.keys()));
      throw new Error(`Model ${modelId} not registered`);
    }

    const provider = this.#providers.get(config.providerId);
    if (!provider) {
      console.error('[ProviderRegistry] Provider not registered:', config.providerId);
      console.error('[ProviderRegistry] Available providers:', Array.from(this.#providers.keys()));
      throw new Error(`Provider ${config.providerId} not registered`);
    }

    if (!provider.valid) {
      console.error('[ProviderRegistry] Provider not valid (missing credentials):', config.providerId);
      throw new Error(`Provider ${config.providerId} not configured (missing credentials)`);
    }

    return provider;
  }

  getModelConfig(modelId: string): ModelConfig {
    const config = this.#models.get(modelId);
    if (!config) {
      throw new Error(`Model ${modelId} not registered`);
    }
    return config;
  }

  listAvailableModels(): ModelConfig[] {
    return Array.from(this.#models.values()).filter((config) => {
      const provider = this.#providers.get(config.providerId);
      return provider?.valid ?? false;
    });
  }

  getAllModels(): ModelConfig[] {
    return Array.from(this.#models.values());
  }
}
