import type { ChronicleSeed, ChronicleSeedList, HardState } from '@glass-frontier/dto';
import {createLLMClient, RetryLLMClient} from '@glass-frontier/llm-client';
import type { PromptTemplateManager } from '@glass-frontier/app';
import type { WorldSchemaStore } from '@glass-frontier/worldstate';
import { randomUUID } from 'node:crypto';

import { PromptTemplateRuntime } from '../prompts/templateRuntime';
import {zodTextFormat} from "openai/helpers/zod";
import {ChronicleSeedListSchema} from "@glass-frontier/dto";

type GenerateSeedRequest = {
  playerId: string;
  locationId: string;
  toneChips?: string[];
  toneNotes?: string;
  count?: number;
  authorizationHeader?: string;
};

export class ChronicleSeedService {
  readonly #templates: PromptTemplateManager;
  readonly #world: WorldSchemaStore;
  readonly #llm: RetryLLMClient;
  readonly #clientCache = new Map<string, RetryLLMClient>();

  constructor(options: {
    templateManager: PromptTemplateManager;
    worldStore: WorldSchemaStore;
    llmClient?: RetryLLMClient;
  }) {
    this.#templates = options.templateManager;
    this.#world = options.worldStore;
    this.#llm = options.llmClient ?? createLLMClient();
  }

  async generateSeeds(request: GenerateSeedRequest): Promise<ChronicleSeed[]> {
    const place = await this.#ensurePlace(request.locationId);
    const breadcrumb = this.#buildBreadcrumb(place);
    const tags = this.#collectTags(breadcrumb);
    const requested = Math.min(Math.max(request.count ?? 3, 1), 5);
    const runtime = new PromptTemplateRuntime({
      playerId: request.playerId,
      manager: this.#templates,
    });

    const prompt = await runtime.render('chronicle-seed', {
      breadcrumb: breadcrumb.map((entry) => `${entry.name} (${entry.kind})`).join(' / '),
      location_description: place.description
        ? place.description
        : place.status
          ? `Status: ${place.status}`
          : 'Uncatalogued locale.',
      location_kind: place.subkind ?? place.kind,
      location_name: place.name,
      requested,
      tags: tags.length > 0 ? tags.join(', ') : 'untagged',
      tone_chips: this.#formatToneChips(request.toneChips),
      tone_notes: this.#formatToneNotes(request.toneNotes),
    });

    const client = this.#resolveClient(request.authorizationHeader);

    const response = await client.generate({
      max_output_tokens: 1600,
      model: "gpt-5-mini",
      metadata: {
        locationId: place.id,
        operation: 'chronicle-seed',
        playerId: request.playerId,
      },
      reasoning: { effort: 'minimal' as const },
      text: {
        format: zodTextFormat(ChronicleSeedListSchema, 'chronicle_response_schema'),
        verbosity: "low",
      },
      instructions: prompt,
      input: [{
          role: 'user',
          content: [{
            type: 'input_text',
            text: 'Generate 3 chronicle seeds with different themes. they should contain a specific initial quest hook or problem to solve.'
          }]
        }
      ]
    }, 'json');
    const tryParsed = ChronicleSeedListSchema.safeParse(response.message);
    return this.#normalizeSeeds(tryParsed.data, requested, place);
  }

  async #ensurePlace(locationId: string): Promise<HardState> {
    const place = await this.#world.getEntity({ id: locationId });
    if (!place || place.kind !== 'location') {
      throw new Error(`Location ${locationId} not found.`);
    }
    return place;
  }

  #buildBreadcrumb(anchor: HardState): HardState[] {
    return [anchor];
  }

  #collectTags(chain: HardState[]): string[] {
    const tags = new Set<string>();
    for (const node of chain) {
      if (node.subkind) {
        tags.add(node.subkind);
      }
      if (node.status) {
        tags.add(node.status);
      }
    }
    return Array.from(tags).slice(0, 12);
  }

  #normalizeSeeds(payload: ChronicleSeedList, requested: number, place: HardState): ChronicleSeed[] {
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
    place: HardState
  ): ChronicleSeed[] {
    const output = [...seeds];
    while (output.length < requested) {
      output.push(this.#fallbackSeed(place, output.length + 1));
    }
    return output;
  }

  #fallbackSeed(place: HardState, index: number): ChronicleSeed {
    const tags = [place.subkind, place.status].filter((tag): tag is string => Boolean(tag)).slice(0, 3);
    return {
      id: randomUUID(),
      tags,
      teaser: `Rumors ripple through ${place.name}, drawing attention to a fresh anomaly hidden within its ${place.subkind ?? place.kind}.`,
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
}
