import type { ChronicleSeed, LocationPlace } from '@glass-frontier/dto';
import type { LocationGraphStore, PromptTemplateManager } from '@glass-frontier/persistence';
import { randomUUID } from 'node:crypto';

import { LangGraphLlmClient } from '../langGraph/llmClient';
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
  readonly #locations: LocationGraphStore;
  readonly #llm: LangGraphLlmClient;

  constructor(options: {
    templateManager: PromptTemplateManager;
    locationGraphStore: LocationGraphStore;
    llmClient?: LangGraphLlmClient;
  }) {
    this.#templates = options.templateManager;
    this.#locations = options.locationGraphStore;
    this.#llm = options.llmClient ?? new LangGraphLlmClient();
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
      tags: tags.length ? tags.join(', ') : 'untagged',
      tone_chips: (request.toneChips ?? []).slice(0, 8).join(', ') || 'none',
      tone_notes: request.toneNotes?.slice(0, 240) ?? '',
    });

    const client = request.authorizationHeader
      ? new LangGraphLlmClient({
        defaultHeaders: {
          authorization: request.authorizationHeader,
          'content-type': 'application/json',
        },
      })
      : this.#llm;

    const response = await client.generateJson({
      maxTokens: 600,
      metadata: {
        locationId: place.locationId,
        operation: 'chronicle-seed',
      },
      prompt,
      temperature: 0.65,
    });

    return this.#normalizeSeeds(response.json, requested, place);
  }

  async #ensurePlace(locationId: string): Promise<LocationPlace> {
    const place = await this.#locations.getPlace(locationId);
    if (!place) {
      throw new Error(`Location ${locationId} not found.`);
    }
    return place;
  }

  async #buildBreadcrumb(anchor: LocationPlace): Promise<LocationPlace[]> {
    const path: LocationPlace[] = [];
    const visited = new Set<string>();
    let current: LocationPlace | null = anchor;
    let depth = 0;
    while (current && !visited.has(current.id) && depth < 20) {
      path.unshift(current);
      visited.add(current.id);
      depth += 1;
      if (!current.canonicalParentId) {
        break;
      }
      current = await this.#locations.getPlace(current.canonicalParentId);
    }
    return path;
  }

  #collectTags(chain: LocationPlace[]): string[] {
    const tags = new Set<string>();
    for (const node of chain) {
      for (const tag of node.tags ?? []) {
        const trimmed = tag.trim().toLowerCase();
        if (trimmed.length) {
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
      if (!seed) {
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
    if (!payload || typeof payload !== 'object') {
      return [];
    }
    const record = payload as Record<string, unknown>;
    return Array.isArray(record.seeds) ? record.seeds : [];
  }

  #coerceSeedEntry(entry: unknown): { title: string; teaser: string; tags: string[] } | null {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const record = entry as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const teaser = typeof record.teaser === 'string' ? record.teaser.trim() : '';
    const tags = Array.isArray(record.tags)
      ? (record.tags as unknown[])
        .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
        .filter((tag): tag is string => Boolean(tag))
        .slice(0, 4)
      : [];
    if (!title || !teaser) {
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
    const tags = (place.tags ?? []).slice(0, 3);
    return {
      id: randomUUID(),
      tags,
      teaser: `Rumors ripple through ${place.name}, drawing attention to a fresh anomaly hidden within its ${place.kind}.`,
      title: `${place.name} Hook ${index}`.slice(0, 80),
    };
  }
}
