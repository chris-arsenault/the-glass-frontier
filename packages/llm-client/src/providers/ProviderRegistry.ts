import type { CatalogModel, ReasoningEffort } from '@glass-frontier/app';

import { ProviderError } from '../ProviderError';
import type { LLMRequest } from '../types';
import type { IProvider } from './IProvider';

export type ResolvedProviderRequest = {
  model: CatalogModel;
  provider: IProvider;
  request: LLMRequest;
};

export class ProviderRegistry {
  readonly #providers = new Map<string, IProvider>();
  readonly #models = new Map<string, CatalogModel>();

  register(provider: IProvider): void {
    if (this.#providers.has(provider.id)) {
      throw new Error(`Provider ${provider.id} already registered`);
    }
    this.#providers.set(provider.id, provider);
  }

  registerModel(config: CatalogModel): void {
    if (this.#models.has(config.modelId)) {
      throw new Error(`Model ${config.modelId} already registered`);
    }
    this.#models.set(config.modelId, config);
  }

  getModelConfig(modelId: string): CatalogModel {
    const config = this.#models.get(modelId);
    if (config === undefined) {
      throw new ProviderError({
        code: 'model_not_registered',
        details: { modelId },
        message: `Model ${modelId} is not registered`,
        status: 400,
      });
    }
    return config;
  }

  resolve(request: LLMRequest): ResolvedProviderRequest {
    const config = this.getModelConfig(request.model);
    this.#assertReasoningEffort(config, request.reasoningEffort);
    if (!Number.isInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0) {
      throw new ProviderError({
        code: 'invalid_max_output_tokens',
        details: { requestedTokens: request.maxOutputTokens },
        message: 'maxOutputTokens must be a positive integer',
        status: 400,
      });
    }
    return {
      model: config,
      provider: this.#getProvider(config),
      request: {
        ...request,
        // Clamp rather than reject. A caller asking for more headroom than a
        // model has is asking for "as much as you will give me", and failing
        // the turn over it forced every caller to pick a cap small enough for
        // the smallest model in the catalog. Those caps then starved the
        // reasoning models: at 1,000 tokens kimi-k2-thinking spent its whole
        // allowance thinking and returned no tool call at all, three retries
        // deep, on every turn of The train that runs on Warm Argument's ore.
        // Output length is the instructions' business, not a ceiling's.
        maxOutputTokens: Math.min(request.maxOutputTokens, config.maxOutputTokens),
        model: config.apiModelId,
      },
    };
  }

  listAvailableModels(): CatalogModel[] {
    return Array.from(this.#models.values()).filter((config) => {
      const provider = this.#providers.get(config.providerId);
      return provider?.valid ?? false;
    });
  }

  getAllModels(): CatalogModel[] {
    return Array.from(this.#models.values());
  }

  #getProvider(config: CatalogModel): IProvider {
    const provider = this.#providers.get(config.providerId);
    if (provider === undefined) {
      throw new Error(`Provider ${config.providerId} not registered`);
    }

    if (!provider.valid) {
      throw new ProviderError({
        code: 'provider_not_configured',
        details: { providerId: config.providerId },
        message: `Provider ${config.providerId} is not configured`,
        status: 500,
      });
    }

    return provider;
  }

  #assertReasoningEffort(config: CatalogModel, effort: ReasoningEffort): void {
    if (config.reasoningEfforts.includes(effort)) {
      return;
    }
    throw new ProviderError({
      code: 'reasoning_effort_not_supported',
      details: { effort, modelId: config.modelId },
      message: `${config.modelId} does not support ${effort} reasoning effort`,
      status: 400,
    });
  }
}
