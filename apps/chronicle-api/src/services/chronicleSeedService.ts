import type { ModelConfigStore, PromptTemplateManager } from '@glass-frontier/app';
import type { ChronicleSeed, HardState, LoreFragment } from '@glass-frontier/dto';
import { createLLMClient, RetryLLMClient } from '@glass-frontier/llm-client';
import type { WorldSchemaStore } from '@glass-frontier/worldstate';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { PromptTemplateRuntime } from './templateRuntime';

type GenerateSeedRequest = {
  playerId: string;
  locationId: string;
  anchorId: string;
  toneChips?: string[];
  toneNotes?: string;
  count?: number;
  authorizationHeader?: string;
};

const SingleSeedSchema = z.object({
  title: z.string().min(1).max(120),
  teaser: z.string().min(200).max(800),
  tags: z.array(z.string()).min(1).max(4),
});

const SeedArraySchema = z.object({
  seeds: z.array(SingleSeedSchema).min(1).max(5),
});

type SingleSeed = z.infer<typeof SingleSeedSchema>;

type SeedTemplatePayload = {
  breadcrumb: string;
  location_description: string;
  location_kind: string;
  location_name: string;
  requested: number;
  tags: string;
  tone_chips: string;
  tone_notes: string;
};

export class ChronicleSeedService {
  readonly #world: WorldSchemaStore;
  readonly #modelConfigStore: ModelConfigStore;
  readonly #templateManager: PromptTemplateManager;
  readonly #llm: RetryLLMClient;
  readonly #clientCache = new Map<string, RetryLLMClient>();

  constructor(options: {
    worldStore: WorldSchemaStore;
    modelConfigStore: ModelConfigStore;
    templateManager: PromptTemplateManager;
    llmClient?: RetryLLMClient;
  }) {
    this.#world = options.worldStore;
    this.#modelConfigStore = options.modelConfigStore;
    this.#templateManager = options.templateManager;
    this.#llm = options.llmClient ?? createLLMClient();
  }

  async generateSeeds(request: GenerateSeedRequest): Promise<ChronicleSeed[]> {
    const [location, anchor] = await Promise.all([
      this.#ensurePlace(request.locationId),
      this.#ensureAnchor(request.anchorId),
    ]);

    // Load lore fragments for context
    const [locationLore, anchorLore] = await Promise.all([
      this.#world.listLoreFragmentsByEntity({ entityId: location.id, limit: 5 }),
      this.#world.listLoreFragmentsByEntity({ entityId: anchor.id, limit: 5 }),
    ]);

    const requested = Math.min(Math.max(request.count ?? 3, 1), 5);
    const templateRuntime = this.#createTemplateRuntime(request.playerId);
    const [instructions, classificationModel] = await Promise.all([
      this.#renderSeedInstructions({
        anchor,
        location,
        requested,
        templateRuntime,
        toneChips: request.toneChips,
        toneNotes: request.toneNotes,
      }),
      this.#modelConfigStore.getModelForCategory('classification', request.playerId),
    ]);
    const client = this.#resolveClient(request.authorizationHeader);

    return this.#generateAllSeeds({
      anchor,
      anchorLore,
      client,
      count: requested,
      instructions,
      location,
      locationLore,
      model: classificationModel,
      playerId: request.playerId,
      toneChips: request.toneChips,
      toneNotes: request.toneNotes,
    });
  }

  async #generateAllSeeds(options: {
    location: HardState;
    anchor: HardState;
    locationLore: LoreFragment[];
    anchorLore: LoreFragment[];
    toneChips?: string[];
    toneNotes?: string;
    instructions: string;
    model: string;
    playerId: string;
    client: RetryLLMClient;
    count: number;
  }): Promise<ChronicleSeed[]> {
    const { location, anchor, locationLore, anchorLore, toneChips, toneNotes, instructions, model, playerId, client, count } = options;

    // Build dynamic fragments as developer messages
    const developerMessages: Array<{ role: 'developer'; content: Array<{ type: 'input_text'; text: string }> }> = [];

    // Location fragment
    developerMessages.push({
      role: 'developer',
      content: [{
        type: 'input_text',
        text: JSON.stringify({
          location: {
            name: location.name,
            kind: location.kind,
            subkind: location.subkind ?? null,
            status: location.status ?? null,
            description: location.description ?? null,
            tags: location.tags ?? [],
            loreFragments: locationLore.map(f => ({
              title: f.title,
              prose: f.prose,
              tags: f.tags ?? [],
            })),
          },
        }, null, 2),
      }],
    });

    // Anchor fragment
    developerMessages.push({
      role: 'developer',
      content: [{
        type: 'input_text',
        text: JSON.stringify({
          anchor: {
            name: anchor.name,
            kind: anchor.kind,
            subkind: anchor.subkind ?? null,
            status: anchor.status ?? null,
            description: anchor.description ?? null,
            tags: anchor.tags ?? [],
            loreFragments: anchorLore.map(f => ({
              title: f.title,
              prose: f.prose,
              tags: f.tags ?? [],
            })),
          },
        }, null, 2),
      }],
    });

    // Tone fragment
    const toneDescription = this.#formatTone(toneChips, toneNotes);
    if (toneDescription) {
      developerMessages.push({
        role: 'developer',
        content: [{
          type: 'input_text',
          text: `Tone: ${toneDescription}`,
        }],
      });
    }

    // Build user message
    const userMessage = `Create ${count} compelling and diverse seeds for chronicles set in ${location.name}, focusing on ${anchor.name}${toneDescription ? ` with a ${toneDescription} tone` : ''}. Each seed should offer a different narrative hook or approach.`;

    const response = await client.generateStructured(
      {
        instructions,
        input: [
          ...developerMessages,
          {
            role: 'user',
            content: [{
              type: 'input_text',
              text: userMessage,
            }],
          },
        ],
        max_output_tokens: 2000,
        model,
        metadata: {
          locationId: location.id,
          anchorId: anchor.id,
          operation: 'seed-generation',
          playerId,
        },
        reasoning: { effort: 'minimal' as const },
        text: {
          verbosity: 'low',
        },
      },
      SeedArraySchema,
      'SeedArray'
    );

    return response.data.seeds.map((seed) => ({
      id: randomUUID(),
      title: seed.title.slice(0, 120),
      teaser: seed.teaser.slice(0, 800),
      tags: seed.tags.slice(0, 4),
    }));
  }

  async #ensurePlace(locationId: string): Promise<HardState> {
    const place = await this.#world.getEntity({ id: locationId });
    if (!place || place.kind !== 'location') {
      throw new Error(`Location ${locationId} not found.`);
    }
    return place;
  }

  async #ensureAnchor(anchorId: string): Promise<HardState> {
    const anchor = await this.#world.getEntity({ id: anchorId });
    if (!anchor) {
      throw new Error(`Anchor entity ${anchorId} not found.`);
    }
    return anchor;
  }

  #createTemplateRuntime(playerId: string): PromptTemplateRuntime {
    return new PromptTemplateRuntime({
      playerId: playerId.trim(),
      manager: this.#templateManager,
    });
  }

  async #renderSeedInstructions(options: {
    templateRuntime: PromptTemplateRuntime;
    location: HardState;
    anchor: HardState;
    toneChips?: string[];
    toneNotes?: string;
    requested: number;
  }): Promise<string> {
    const payload = this.#buildSeedTemplatePayload({
      anchor: options.anchor,
      location: options.location,
      requested: options.requested,
      toneChips: options.toneChips,
      toneNotes: options.toneNotes,
    });
    return options.templateRuntime.render('chronicle-seed', payload);
  }

  #buildSeedTemplatePayload(options: {
    location: HardState;
    anchor: HardState;
    toneChips?: string[];
    toneNotes?: string;
    requested: number;
  }): SeedTemplatePayload {
    const toneChips = this.#normalizeToneChips(options.toneChips);
    const toneNotes = this.#normalizeToneNotes(options.toneNotes);
    const tags = this.#buildSeedTags(options.location, options.anchor);

    return {
      breadcrumb: this.#buildBreadcrumb(options.location),
      location_description: options.location.description ?? 'No description provided.',
      location_kind: options.location.subkind ?? options.location.kind,
      location_name: options.location.name,
      requested: options.requested,
      tags: tags.length > 0 ? tags.join(', ') : 'none',
      tone_chips: toneChips.length > 0 ? toneChips.join(', ') : 'none',
      tone_notes: toneNotes ?? 'none',
    };
  }

  #buildBreadcrumb(location: HardState): string {
    const segments = [location.subkind, location.status].filter(
      (entry): entry is string => Boolean(entry)
    );
    return segments.length > 0 ? segments.join(' › ') : location.name;
  }

  #buildSeedTags(location: HardState, anchor: HardState): string[] {
    return [
      location.subkind,
      location.status,
      anchor.kind,
      anchor.subkind,
      anchor.status,
    ].filter((tag): tag is string => Boolean(tag));
  }

  #normalizeToneChips(chips?: string[]): string[] {
    if (!Array.isArray(chips)) {
      return [];
    }
    return chips
      .map((chip) => chip.trim())
      .filter((chip) => chip.length > 0)
      .slice(0, 8);
  }

  #normalizeToneNotes(notes?: string): string | null {
    if (typeof notes !== 'string') {
      return null;
    }
    const trimmed = notes.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 240) : null;
  }

  #formatTone(chips?: string[], notes?: string): string {
    const parts: string[] = [];

    const normalizedChips = this.#normalizeToneChips(chips);
    if (normalizedChips.length > 0) {
      parts.push(normalizedChips.join(', '));
    }

    const normalizedNotes = this.#normalizeToneNotes(notes);
    if (normalizedNotes) {
      parts.push(normalizedNotes);
    }

    return parts.join('; ');
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
    const client = createLLMClient();
    this.#clientCache.set(sanitized, client);
    return client;
  }
}
