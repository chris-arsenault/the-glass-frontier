import type { ChronicleSeed } from '@glass-frontier/dto';
import { LangGraphLlmClient } from '@glass-frontier/llm-client';
import type { PromptTemplateManager } from '@glass-frontier/persistence';
import type { LocationSummary, WorldStateStoreV2 } from '@glass-frontier/worldstate';
import { randomUUID } from 'node:crypto';

import { PromptTemplateRuntime } from '../langGraph/prompts/templateRuntime';

type GenerateSeedRequest = {
  loginId: string;
  locationId: string;
  toneChips?: string[];
  toneNotes?: string;
  count?: number;
  authorizationHeader?: string;
};

export class ChronicleSeedService {
  readonly #templates: PromptTemplateManager;
  readonly #worldState: WorldStateStoreV2;
  readonly #llm: LangGraphLlmClient;
  readonly #clientCache = new Map<string, LangGraphLlmClient>();

  constructor(options: {
    templateManager: PromptTemplateManager;
    worldStateStore: WorldStateStoreV2;
    llmClient?: LangGraphLlmClient;
  }) {
    this.#templates = options.templateManager;
    this.#worldState = options.worldStateStore;
    this.#llm = options.llmClient ?? new LangGraphLlmClient();
  }

  async generateSeeds(request: GenerateSeedRequest): Promise<ChronicleSeed[]> {
    const summary = await this.#ensureLocation(request.locationId);
    const breadcrumb = summary.breadcrumb.map((entry) => `${entry.name} (${entry.kind})`).join(' / ');
    const tags = this.#collectTags(summary.tags);
    const requested = Math.min(Math.max(request.count ?? 3, 1), 5);
    const runtime = new PromptTemplateRuntime({
      loginId: request.loginId,
      manager: this.#templates,
    });

    const prompt = await runtime.render('chronicle-seed', {
      breadcrumb,
      location_description: summary.description ?? 'Uncatalogued locale.',
      location_kind: summary.breadcrumb.at(-1)?.kind ?? 'locale',
      location_name: summary.name,
      requested,
      tags: tags.length > 0 ? tags.join(', ') : 'untagged',
      tone_chips: this.#formatToneChips(request.toneChips),
      tone_notes: this.#formatToneNotes(request.toneNotes),
    });

    const client = this.#resolveClient(request.authorizationHeader);

    const response = await client.generateJson({
      maxTokens: 600,
      metadata: {
        locationId: summary.id,
        operation: 'chronicle-seed',
      },
      prompt,
      temperature: 0.65,
    });

    return this.#normalizeSeeds(response.json, requested, summary);
  }

  async #ensureLocation(locationId: string): Promise<LocationSummary> {
    const location = await this.#worldState.getLocation(locationId);
    if (location === null) {
      throw new Error(`Location ${locationId} not found.`);
    }
    return location;
  }

  #collectTags(source: string[]): string[] {
    const tags = new Set<string>();
    for (const tag of source) {
      const trimmed = tag.trim().toLowerCase();
      if (trimmed.length > 0) {
        tags.add(trimmed);
      }
    }
    return Array.from(tags).slice(0, 12);
  }

  #normalizeSeeds(payload: unknown, requested: number, location: LocationSummary): ChronicleSeed[] {
    const normalized: ChronicleSeed[] = [];
    for (const entry of this.#extractSeedEntries(payload)) {
      if (normalized.length >= requested) {
        break;
      }
      const seed = this.#coerceSeedEntry(entry);
      if (seed === null) {
        continue;
      }
      normalized.push({
        id: randomUUID(),
        tags: seed.tags,
        teaser: seed.teaser.slice(0, 280),
        title: seed.title.slice(0, 80),
      });
    }
    return this.#fillSeedShortfall(normalized, requested, location);
  }

  #extractSeedEntries(payload: unknown): unknown[] {
    if (payload === null || typeof payload !== 'object') {
      return [];
    }
    const record = payload as Record<string, unknown>;
    return Array.isArray(record.seeds) ? record.seeds : [];
  }

  #coerceSeedEntry(entry: unknown): { title: string; teaser: string; tags: string[] } | null {
    if (entry === null || typeof entry !== 'object') {
      return null;
    }
    const record = entry as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const teaser = typeof record.teaser === 'string' ? record.teaser.trim() : '';
    const tags = Array.isArray(record.tags)
      ? (record.tags as unknown[])
        .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
        .filter((tag): tag is string => tag.length > 0)
        .slice(0, 4)
      : [];
    if (!this.#isNonEmpty(title) || !this.#isNonEmpty(teaser)) {
      return null;
    }
    return { tags, teaser, title };
  }

  #fillSeedShortfall(
    seeds: ChronicleSeed[],
    requested: number,
    location: LocationSummary
  ): ChronicleSeed[] {
    const output = [...seeds];
    while (output.length < requested) {
      output.push(this.#fallbackSeed(location, output.length + 1));
    }
    return output;
  }

  #fallbackSeed(location: LocationSummary, index: number): ChronicleSeed {
    const tags = location.tags.slice(0, 3);
    return {
      id: randomUUID(),
      tags,
      teaser: `Rumors ripple through ${location.name}, drawing attention to a fresh anomaly hidden within its corridors.`,
      title: `${location.name} Hook ${index}`.slice(0, 80),
    };
  }

  #formatToneChips(chips?: string[]): string {
    if (!Array.isArray(chips) || chips.length === 0) {
      return 'none';
    }
    const normalized = chips
      .map((chip) => chip.trim())
      .filter((chip) => chip.length > 0)
      .slice(0, 8);
    return normalized.length > 0 ? normalized.join(', ') : 'none';
  }

  #formatToneNotes(notes?: string): string {
    if (!this.#isNonEmpty(notes)) {
      return '';
    }
    return notes.slice(0, 240);
  }

  #isNonEmpty(value?: string | null): value is string {
    if (typeof value !== 'string') {
      return false;
    }
    return value.trim().length > 0;
  }

  #sanitizeHeader(header?: string): string | null {
    if (typeof header !== 'string') {
      return null;
    }
    const trimmed = header.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  #resolveClient(authorizationHeader?: string): LangGraphLlmClient {
    const sanitized = this.#sanitizeHeader(authorizationHeader);
    if (sanitized === null) {
      return this.#llm;
    }
    const cached = this.#clientCache.get(sanitized);
    if (cached !== undefined) {
      return cached;
    }
    const client = new LangGraphLlmClient({
      defaultHeaders: { Authorization: sanitized },
    });
    this.#clientCache.set(sanitized, client);
    return client;
  }

}
