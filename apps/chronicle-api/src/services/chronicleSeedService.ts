import type { ChronicleSeed, HardState, LoreFragment } from '@glass-frontier/dto';
import { createLLMClient, RetryLLMClient } from '@glass-frontier/llm-client';
import type { WorldSchemaStore } from '@glass-frontier/worldstate';
import type { ModelConfigStore } from '@glass-frontier/app';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

export class ChronicleSeedService {
  readonly #world: WorldSchemaStore;
  readonly #modelConfigStore: ModelConfigStore;
  readonly #llm: RetryLLMClient;
  readonly #clientCache = new Map<string, RetryLLMClient>();
  #instructions: string | null = null;

  constructor(options: {
    worldStore: WorldSchemaStore;
    modelConfigStore: ModelConfigStore;
    llmClient?: RetryLLMClient;
  }) {
    this.#world = options.worldStore;
    this.#modelConfigStore = options.modelConfigStore;
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

    const instructions = await this.#loadInstructions();
    const client = this.#resolveClient(request.authorizationHeader);
    const classificationModel = await this.#modelConfigStore.getModelForCategory('classification', request.playerId);

    const requested = Math.min(Math.max(request.count ?? 3, 1), 5);

    try {
      const seeds = await this.#generateAllSeeds({
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
      return seeds;
    } catch (error) {
      console.error('[SeedService] Failed to generate seeds:', error);
      // Return fallback seeds on error
      return Array.from({ length: requested }, (_, i) =>
        this.#fallbackSeed(location, anchor, i + 1)
      );
    }
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

  async #loadInstructions(): Promise<string> {
    if (this.#instructions !== null) {
      return this.#instructions;
    }

    const templatePath = join(__dirname, '../prompts/templates/seed-generation.md');
    this.#instructions = await readFile(templatePath, 'utf-8');
    return this.#instructions;
  }

  #formatTone(chips?: string[], notes?: string): string {
    const parts: string[] = [];

    if (Array.isArray(chips) && chips.length > 0) {
      const normalized = chips
        .map((chip) => chip.trim())
        .filter((chip) => chip.length > 0)
        .slice(0, 8);
      if (normalized.length > 0) {
        parts.push(normalized.join(', '));
      }
    }

    if (typeof notes === 'string' && notes.trim().length > 0) {
      parts.push(notes.trim().slice(0, 240));
    }

    return parts.join('; ');
  }

  #fallbackSeed(location: HardState, anchor: HardState, index: number): ChronicleSeed {
    const tags = [
      location.subkind,
      location.status,
      anchor.kind,
      anchor.status,
    ].filter((tag): tag is string => Boolean(tag)).slice(0, 4);

    return {
      id: randomUUID(),
      tags: tags.length > 0 ? tags : ['mystery'],
      teaser: `Something unusual is happening at ${location.name}, centered around ${anchor.name}. Investigation required.`,
      title: `${location.name}: ${anchor.name} Mystery`,
    };
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
