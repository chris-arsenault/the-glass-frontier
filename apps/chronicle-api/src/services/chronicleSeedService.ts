import type { ChronicleSeed, LocationPlace } from '@glass-frontier/dto';
import {createLLMClient, RetryLLMClient} from '@glass-frontier/llm-client';
import type { LocationGraphStore, PromptTemplateManager } from '@glass-frontier/persistence';
import { randomUUID } from 'node:crypto';

import { PromptTemplateRuntime } from '../prompts/templateRuntime';

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
  readonly #locations: LocationGraphStore;
  readonly #llm: RetryLLMClient;
  readonly #clientCache = new Map<string, RetryLLMClient>();

  constructor(options: {
    templateManager: PromptTemplateManager;
    locationGraphStore: LocationGraphStore;
    llmClient?: RetryLLMClient;
  }) {
    this.#templates = options.templateManager;
    this.#locations = options.locationGraphStore;
    this.#llm = options.llmClient ?? createLLMClient();
  }

  async generateSeeds(request: GenerateSeedRequest): Promise<ChronicleSeed[]> {
    const place = await this.#ensurePlace(request.locationId);
    const breadcrumb = await this.#buildBreadcrumb(place);
    const tags = this.#collectTags(breadcrumb);
    const requested = Math.min(Math.max(request.count ?? 3, 1), 5);
    const runtime = new PromptTemplateRuntime({
      loginId: request.loginId,
      manager: this.#templates,
    });

    const prompt = await runtime.render('chronicle-seed', {
      breadcrumb: breadcrumb.map((entry) => `${entry.name} (${entry.kind})`).join(' / '),
      location_description: place.description ?? 'Uncatalogued locale.',
      location_kind: place.kind,
      location_name: place.name,
      requested,
      tags: tags.length > 0 ? tags.join(', ') : 'untagged',
      tone_chips: this.#formatToneChips(request.toneChips),
      tone_notes: this.#formatToneNotes(request.toneNotes),
    });

    const client = this.#resolveClient(request.authorizationHeader);

    const response = await client.generate({
      maxTokens: 600,
      metadata: {
        locationId: place.locationId,
        operation: 'chronicle-seed',
      },
      prompt,
      temperature: 0.65,
    }, 'json');

    return this.#normalizeSeeds(response.json, requested, place);
  }

  async #ensurePlace(locationId: string): Promise<LocationPlace> {
    const place = await this.#locations.getPlace(locationId);
    if (place === undefined || place === null) {
      throw new Error(`Location ${locationId} not found.`);
    }
    return place;
  }

  async #buildBreadcrumb(anchor: LocationPlace): Promise<LocationPlace[]> {
    return this.#collectBreadcrumb(anchor, new Set<string>(), 0);
  }

  #collectTags(chain: LocationPlace[]): string[] {
    const tags = new Set<string>();
    for (const node of chain) {
      const nodeTags = Array.isArray(node.tags)
        ? node.tags.filter((tag): tag is string => typeof tag === 'string')
        : [];
      for (const tag of nodeTags) {
        const trimmed = tag.trim().toLowerCase();
        if (trimmed.length > 0) {
          tags.add(trimmed);
        }
      }
    }
    return Array.from(tags).slice(0, 12);
  }

  #normalizeSeeds(payload: unknown, requested: number, place: LocationPlace): ChronicleSeed[] {
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
    return this.#fillSeedShortfall(normalized, requested, place);
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
    place: LocationPlace
  ): ChronicleSeed[] {
    const output = [...seeds];
    while (output.length < requested) {
      output.push(this.#fallbackSeed(place, output.length + 1));
    }
    return output;
  }

  #fallbackSeed(place: LocationPlace, index: number): ChronicleSeed {
    const tags = Array.isArray(place.tags) ? place.tags.slice(0, 3) : [];
    return {
      id: randomUUID(),
      tags,
      teaser: `Rumors ripple through ${place.name}, drawing attention to a fresh anomaly hidden within its ${place.kind}.`,
      title: `${place.name} Hook ${index}`.slice(0, 80),
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

  #resolveClient(authorizationHeader?: string): RetryLLMClient {
    const sanitized = this.#sanitizeHeader(authorizationHeader);
    if (sanitized === null) {
      return this.#llm;
    }
    const cached = this.#clientCache.get(sanitized);
    if (cached !== undefined) {
      return cached;
    }
    const client = createLLMClient()
    this.#clientCache.set(sanitized, client);
    return client;
  }

  async #collectBreadcrumb(
    node: LocationPlace | null,
    visited: Set<string>,
    depth: number
  ): Promise<LocationPlace[]> {
    if (node === null) {
      return [];
    }
    if (visited.has(node.id) || depth >= 20) {
      return [node];
    }
    visited.add(node.id);
    const parentId =
      typeof node.canonicalParentId === 'string' && node.canonicalParentId.length > 0
        ? node.canonicalParentId
        : null;
    if (parentId === null) {
      return [node];
    }
    const parentPlace = await this.#locations.getPlace(parentId);
    if (parentPlace === undefined || parentPlace === null) {
      return [node];
    }
    const path = await this.#collectBreadcrumb(parentPlace, visited, depth + 1);
    return [...path, node];
  }
}
