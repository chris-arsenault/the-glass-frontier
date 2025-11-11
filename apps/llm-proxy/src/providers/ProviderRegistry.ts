import { OpenAIProvider } from './OpenAIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { BaseProvider } from './BaseProvider';
import { ProviderError } from './ProviderError';

type ProviderMap = Map<string, BaseProvider>;

export class ProviderRegistry {
  private readonly registry: ProviderMap;

  constructor(providers?: BaseProvider[]) {
    const available = (providers ?? this.defaultProviders()).filter((p) => p.isValid());

    if (available.length === 0) {
      throw new ProviderError({
        code: 'no_providers_configured',
        status: 503,
        retryable: false,
        details: { attempted: ['openai', 'anthropic'] },
      });
    }

    this.registry = this.buildRegistry(available);
  }

  providerOrder(): BaseProvider[] {
    const providers: BaseProvider[] = [];
    const provider = this.get('openai');
    if (provider) {
      providers.push(provider);
    }
    return providers;
  }

  get(idOrAlias: string): BaseProvider | undefined {
    const key = this.normalizeId(idOrAlias);
    if (!key) return undefined;
    return this.registry.get(key);
  }

  listCanonical(): string[] {
    // Unique canonical ids of registered providers
    const ids = new Set<string>();
    for (const p of new Set(this.registry.values())) {
      if (p?.id) ids.add(this.normalizeId(p.id));
    }
    return Array.from(ids).sort();
  }

  // -- internals --

  private defaultProviders(): BaseProvider[] {
    // Construct lazily to avoid side effects if caller injects providers.
    const openai = new OpenAIProvider();
    const anthropic = new AnthropicProvider();
    return [openai, anthropic];
  }

  private buildRegistry(providers: readonly BaseProvider[]): ProviderMap {
    const map: ProviderMap = new Map();

    for (const provider of providers) {
      const id = this.normalizeId(provider.id);
      if (!id) continue;

      // Collision checks
      if (map.has(id)) {
        throw new ProviderError({
          code: 'duplicate_provider_id',
          status: 500,
          retryable: false,
          details: { id },
        });
      }
      map.set(id, provider);

      const aliases = Array.isArray(provider.aliases) ? provider.aliases : [];
      for (const alias of aliases) {
        const a = this.normalizeId(alias);
        if (!a) continue;
        const existing = map.get(a);
        if (existing && existing !== provider) {
          throw new ProviderError({
            code: 'duplicate_provider_alias',
            status: 500,
            retryable: false,
            details: { alias: a, existing: existing.id, incoming: provider.id },
          });
        }
        map.set(a, provider);
      }
    }

    return map;
  }

  private normalizeId(id?: string): string {
    return (id ?? '').trim().toLowerCase();
  }
}
