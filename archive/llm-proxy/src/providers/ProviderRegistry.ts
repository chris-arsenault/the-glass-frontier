import { AnthropicProvider } from './AnthropicProvider';
import type { BaseProvider } from './BaseProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { ProviderError } from './ProviderError';

type ProviderMap = Map<string, BaseProvider>;

export class ProviderRegistry {
  private readonly registry: ProviderMap;

  constructor(providers?: BaseProvider[]) {
    const available = (providers ?? this.defaultProviders()).filter((p) => p.isValid());

    if (available.length === 0) {
      throw new ProviderError({
        code: 'no_providers_configured',
        details: { attempted: ['openai', 'anthropic'] },
        retryable: false,
        status: 503,
      });
    }

    this.registry = this.buildRegistry(available);
  }

  providerOrder(): BaseProvider[] {
    const remaining = new Set(this.listCanonical());
    const orderedIds = [
      ...this.extractPreferredProviders(remaining, ['openai', 'anthropic']),
      ...remaining,
    ];

    return orderedIds
      .map((id) => this.registry.get(id))
      .filter((provider): provider is BaseProvider => provider !== undefined);
  }

  get(idOrAlias: string): BaseProvider | undefined {
    const key = this.normalizeId(idOrAlias);
    if (key.length === 0) {
      return undefined;
    }
    return this.registry.get(key);
  }

  listCanonical(): string[] {
    const ids = new Set<string>();
    for (const provider of this.registry.values()) {
      const id = this.normalizeId(provider.id);
      if (id.length > 0) {
        ids.add(id);
      }
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
      this.registerProvider(map, provider);
    }
    return map;
  }

  private normalizeId(id?: string): string {
    return (id ?? '').trim().toLowerCase();
  }

  private extractPreferredProviders(ids: Set<string>, preference: string[]): string[] {
    const ordered: string[] = [];
    for (const id of preference) {
      if (ids.delete(id)) {
        ordered.push(id);
      }
    }
    return ordered;
  }

  private registerProvider(map: ProviderMap, provider: BaseProvider): void {
    const id = this.normalizeId(provider.id);
    if (id.length === 0) {
      return;
    }
    this.assertUniqueId(map, id);
    map.set(id, provider);
    this.registerAliases(map, provider);
  }

  private assertUniqueId(map: ProviderMap, id: string): void {
    if (!map.has(id)) {
      return;
    }
    throw new ProviderError({
      code: 'duplicate_provider_id',
      details: { id },
      retryable: false,
      status: 500,
    });
  }

  private registerAliases(map: ProviderMap, provider: BaseProvider): void {
    const aliases = Array.isArray(provider.aliases) ? provider.aliases : [];
    for (const alias of aliases) {
      this.registerAlias(map, provider, alias);
    }
  }

  private registerAlias(map: ProviderMap, provider: BaseProvider, alias: string): void {
    const normalized = this.normalizeId(alias);
    if (normalized.length === 0) {
      return;
    }
    const existing = map.get(normalized);
    if (existing !== undefined && existing !== provider) {
      throw new ProviderError({
        code: 'duplicate_provider_alias',
        details: { alias: normalized, existing: existing.id, incoming: provider.id },
        retryable: false,
        status: 500,
      });
    }
    map.set(normalized, provider);
  }
}
