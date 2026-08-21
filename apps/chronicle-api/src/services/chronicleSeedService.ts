import type { ModelConfigStore, PromptTemplateManager } from '@glass-frontier/app';
import type { ChronicleSeed, HardState, LoreFragment } from '@glass-frontier/dto';
import type { RetryLLMClient } from '@glass-frontier/llm-client';
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
};

const SingleSeedSchema = z.object({
  tags: z.array(z.string()).min(1).max(4),
  teaser: z.string().min(200).max(800),
  title: z.string().min(1).max(120),
});

const SeedArraySchema = z.object({
  seeds: z.array(SingleSeedSchema).min(1).max(5),
});

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

type DeveloperMessage = {
  content: Array<{ text: string; type: 'input_text' }>;
  role: 'developer';
};

type GenerateAllSeedsOptions = {
  anchor: HardState;
  anchorLore: LoreFragment[];
  count: number;
  instructions: string;
  location: HardState;
  locationLore: LoreFragment[];
  model: string;
  playerId: string;
  toneChips?: string[];
  toneNotes?: string;
};

export class ChronicleSeedService {
  readonly #world: WorldSchemaStore;
  readonly #modelConfigStore: ModelConfigStore;
  readonly #templateManager: PromptTemplateManager;
  readonly #llm: RetryLLMClient;

  constructor(options: {
    worldStore: WorldSchemaStore;
    modelConfigStore: ModelConfigStore;
    templateManager: PromptTemplateManager;
    llmClient: RetryLLMClient;
  }) {
    this.#world = options.worldStore;
    this.#modelConfigStore = options.modelConfigStore;
    this.#templateManager = options.templateManager;
    this.#llm = options.llmClient;
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
    return this.#generateAllSeeds({
      anchor,
      anchorLore,
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

  async #generateAllSeeds(options: GenerateAllSeedsOptions): Promise<ChronicleSeed[]> {
    const developerMessages = this.#buildDeveloperMessages(options);
    const response = await this.#llm.generateStructured(
      {
        input: [
          ...developerMessages,
          {
            content: [{
              text: this.#buildUserMessage(options),
              type: 'input_text',
            }],
            role: 'user',
          },
        ],
        instructions: options.instructions,
        maxOutputTokens: 2000,
        metadata: {
          anchorId: options.anchor.id,
          locationId: options.location.id,
          operation: 'seed-generation',
          playerId: options.playerId,
        },
        model: options.model,
        reasoningEffort: 'low',
      },
      SeedArraySchema,
      'SeedArray'
    );

    return response.data.seeds.map((seed) => ({
      id: randomUUID(),
      tags: seed.tags.slice(0, 4),
      teaser: seed.teaser.slice(0, 800),
      title: seed.title.slice(0, 120),
    }));
  }

  #buildDeveloperMessages(options: GenerateAllSeedsOptions): DeveloperMessage[] {
    const messages = [
      this.#createDeveloperMessage({
        location: this.#buildEntityContext(options.location, options.locationLore),
      }),
      this.#createDeveloperMessage({
        anchor: this.#buildEntityContext(options.anchor, options.anchorLore),
      }),
    ];
    const toneDescription = this.#formatTone(options.toneChips, options.toneNotes);
    if (toneDescription.length > 0) {
      messages.push(this.#createDeveloperMessage(`Tone: ${toneDescription}`));
    }
    return messages;
  }

  #buildEntityContext(entity: HardState, lore: LoreFragment[]): Record<string, unknown> {
    return {
      description: entity.description ?? null,
      kind: entity.kind,
      loreFragments: lore.map((fragment) => ({
        prose: fragment.prose,
        tags: fragment.tags,
        title: fragment.title,
      })),
      name: entity.name,
      status: entity.status ?? null,
      subkind: entity.subkind ?? null,
    };
  }

  #buildUserMessage(options: GenerateAllSeedsOptions): string {
    const toneDescription = this.#formatTone(options.toneChips, options.toneNotes);
    const toneClause = toneDescription.length > 0
      ? ` with a ${toneDescription} tone`
      : '';
    return `Create ${options.count} compelling and diverse seeds for chronicles set in ${options.location.name}, focusing on ${options.anchor.name}${toneClause}. Each seed should offer a different narrative hook or approach.`;
  }

  #createDeveloperMessage(payload: Record<string, unknown> | string): DeveloperMessage {
    return {
      content: [{
        text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
        type: 'input_text',
      }],
      role: 'developer',
    };
  }

  async #ensurePlace(locationId: string): Promise<HardState> {
    const place = await this.#world.getEntity({ id: locationId });
    if (place === null || place.kind !== 'location') {
      throw new Error(`Location ${locationId} not found.`);
    }
    return place;
  }

  async #ensureAnchor(anchorId: string): Promise<HardState> {
    const anchor = await this.#world.getEntity({ id: anchorId });
    if (anchor === null) {
      throw new Error(`Anchor entity ${anchorId} not found.`);
    }
    return anchor;
  }

  #createTemplateRuntime(playerId: string): PromptTemplateRuntime {
    return new PromptTemplateRuntime({
      manager: this.#templateManager,
      playerId: playerId.trim(),
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
      (entry) => entry !== undefined
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
    ].filter((tag) => tag !== undefined);
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
    if (normalizedNotes !== null) {
      parts.push(normalizedNotes);
    }

    return parts.join('; ');
  }

}
