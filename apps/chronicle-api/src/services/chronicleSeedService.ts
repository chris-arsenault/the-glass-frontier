import type { ModelConfigStore, PromptTemplateManager } from '@glass-frontier/app';
import {
  characterView,
  entityView,
  originNamesFrom,
  PromptTemplateRuntime,
  renderBlock,
} from '@glass-frontier/app';
import type {
  Character,
  ChronicleSeed,
  HardState,
  LoreFragment,
  WorldReferenceSlug,
} from '@glass-frontier/dto';
import { WorldThreadSeed } from '@glass-frontier/dto';
import type { LLMPlayer, RetryLLMClient } from '@glass-frontier/llm-client';
import type {
  EncyclopediaStore,
  StoredEncyclopediaEntry,
  WorldSchemaStore,
} from '@glass-frontier/worldstate';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { loadGroundingEntries } from './encyclopediaGrounding';

type GenerateSeedRequest = {
  playerId: string;
  player: LLMPlayer;
  locationId: string;
  anchorId: string;
  character: Character;
  toneChips?: string[];
  toneNotes?: string;
  count?: number;
};

type GenerateOpeningRequest = {
  anchorId?: string;
  character: Character;
  chronicleId: string;
  locationId: string;
  playerId: string;
  player: LLMPlayer;
  playerGoal: string;
  seedText: string;
  title: string;
  toneChips?: string[];
  toneNotes?: string;
  worldThread: WorldThreadSeed;
};

const SingleSeedSchema = z.object({
  playerGoal: z.string().min(1).max(240),
  tags: z.array(z.string()).min(1).max(4),
  teaser: z.string().min(200).max(800),
  title: z.string().min(1).max(120),
  worldThread: WorldThreadSeed,
});

const SeedArraySchema = z.object({
  seeds: z.array(SingleSeedSchema).min(1).max(5),
});

type DeveloperMessage = {
  content: Array<{ text: string; type: 'input_text' }>;
  role: 'developer';
};

type GenerateAllSeedsOptions = {
  anchor: HardState;
  anchorLore: LoreFragment[];
  character: Character;
  count: number;
  encyclopediaEntries: StoredEncyclopediaEntry[];
  instructions: string;
  location: HardState;
  locationLore: LoreFragment[];
  model: string;
  originNames: Map<string, string>;
  playerId: string;
  player: LLMPlayer;
  toneChips?: string[];
  toneNotes?: string;
};

export class ChronicleSeedService {
  readonly #encyclopedia: EncyclopediaStore;
  readonly #world: WorldSchemaStore;
  readonly #modelConfigStore: ModelConfigStore;
  readonly #templateManager: PromptTemplateManager;
  readonly #llm: RetryLLMClient;

  constructor(options: {
    encyclopediaStore: EncyclopediaStore;
    worldStore: WorldSchemaStore;
    modelConfigStore: ModelConfigStore;
    templateManager: PromptTemplateManager;
    llmClient: RetryLLMClient;
  }) {
    this.#encyclopedia = options.encyclopediaStore;
    this.#world = options.worldStore;
    this.#modelConfigStore = options.modelConfigStore;
    this.#templateManager = options.templateManager;
    this.#llm = options.llmClient;
  }

  async generateSeeds(request: GenerateSeedRequest): Promise<ChronicleSeed[]> {
    const location = await this.#ensurePlace(request.locationId);
    const anchor = await this.#ensureAnchor(location.id, request.anchorId);

    // Load lore fragments for context
    const [locationLore, anchorLore, originNames, encyclopediaEntries] = await Promise.all([
      this.#world.listLoreFragmentsByEntity({ entityId: location.id, limit: 5 }),
      this.#world.listLoreFragmentsByEntity({ entityId: anchor.id, limit: 5 }),
      this.#resolveOriginNames(request.character),
      this.#loadGroundingEntries(location),
    ]);

    const requested = Math.min(Math.max(request.count ?? 3, 1), 5);
    // Seeds are the most creativity-demanding text in the product, and the
    // chosen one becomes the founding player thread: they get the prose model.
    const [instructions, proseModel] = await Promise.all([
      this.#createTemplateRuntime(request.playerId).render('chronicle-seed', {}),
      this.#modelConfigStore.getModelForCategory('prose', request.playerId),
    ]);
    return this.#generateAllSeeds({
      anchor,
      anchorLore,
      character: request.character,
      count: requested,
      encyclopediaEntries,
      instructions,
      location,
      locationLore,
      model: proseModel,
      originNames,
      player: request.player,
      playerId: request.playerId,
      toneChips: request.toneChips,
      toneNotes: request.toneNotes,
    });
  }

  async generateOpening(request: GenerateOpeningRequest): Promise<{
    openingReferenceSlugs: WorldReferenceSlug[];
    text: string;
  }> {
    const location = await this.#ensurePlace(request.locationId);
    const anchor = request.anchorId === undefined
      ? null
      : await this.#ensureAnchor(location.id, request.anchorId);
    const [
      locationLore,
      anchorLore,
      instructions,
      proseModel,
      originNames,
      encyclopediaEntries,
    ] = await Promise.all([
      this.#world.listLoreFragmentsByEntity({ entityId: location.id, limit: 5 }),
      anchor === null
        ? Promise.resolve([])
        : this.#world.listLoreFragmentsByEntity({ entityId: anchor.id, limit: 5 }),
      this.#createTemplateRuntime(request.playerId).render('chronicle-opening', {}),
      this.#modelConfigStore.getModelForCategory('prose', request.playerId),
      this.#resolveOriginNames(request.character),
      this.#loadGroundingEntries(location),
    ]);
    const developerMessages = this.#buildOpeningDeveloperMessages({
      anchor,
      anchorLore,
      encyclopediaEntries,
      location,
      locationLore,
      originNames,
      request,
    });
    const text = await this.#generateOpeningText({
      developerMessages,
      instructions,
      location,
      model: proseModel,
      request,
    });
    const supplied = new Set(encyclopediaEntries.map((entry) => entry.slug));
    const mentioned = await this.#encyclopedia.findMentionedEntries(text);
    return {
      openingReferenceSlugs: mentioned
        .filter((entry) => supplied.has(entry.slug))
        .map((entry) => `encyclopedia:${entry.slug}`),
      text,
    };
  }

  #buildOpeningDeveloperMessages(options: {
    anchor: HardState | null;
    anchorLore: LoreFragment[];
    location: HardState;
    locationLore: LoreFragment[];
    originNames: Map<string, string>;
    encyclopediaEntries: StoredEncyclopediaEntry[];
    request: GenerateOpeningRequest;
  }): DeveloperMessage[] {
    const developerMessages: DeveloperMessage[] = [
      this.#createDeveloperMessage(
        'LOCATION',
        this.#buildEntityContext(options.location, options.locationLore)
      ),
    ];
    if (options.anchor !== null) {
      developerMessages.push(this.#createDeveloperMessage(
        'ANCHOR',
        this.#buildEntityContext(options.anchor, options.anchorLore)
      ));
    }
    if (options.encyclopediaEntries.length > 0) {
      developerMessages.push(this.#createDeveloperMessage(
        'ENCYCLOPEDIA',
        this.#encyclopediaContext(options.encyclopediaEntries)
      ));
    }
    const tone = this.#formatTone(options.request.toneChips, options.request.toneNotes);
    developerMessages.push(
      this.#createDeveloperMessage(
        'CHARACTER',
        this.#formatSeedCharacter(options.request.character, options.originNames)
      ),
      this.#createDeveloperMessage('CHRONICLE', {
        playerGoal: options.request.playerGoal,
        seed: options.request.seedText.trim(),
        title: options.request.title,
        tone: tone.length > 0 ? tone : 'none specified',
        worldThread: options.request.worldThread,
      })
    );
    return developerMessages;
  }

  async #generateOpeningText(options: {
    developerMessages: DeveloperMessage[];
    instructions: string;
    location: HardState;
    model: string;
    request: GenerateOpeningRequest;
  }): Promise<string> {
    const response = await this.#llm.generate(
      {
        input: [
          ...options.developerMessages,
          {
            content: [{
              text: `Open the chronicle for ${options.request.character.name} now.`,
              type: 'input_text',
            }],
            role: 'user',
          },
        ],
        instructions: options.instructions,
        maxOutputTokens: 600,
        metadata: {
          chronicleId: options.request.chronicleId,
          locationId: options.location.id,
          operation: 'chronicle-opening',
          playerId: options.request.playerId,
        },
        model: options.model,
        player: options.request.player,
        reasoningEffort: 'low',
      },
      'string'
    );
    if (typeof response.message !== 'string' || response.message.trim().length === 0) {
      throw new Error('Chronicle opening generation returned an empty response.');
    }
    return response.message.trim();
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
        player: options.player,
        reasoningEffort: 'low',
      },
      SeedArraySchema,
      'SeedArray'
    );

    return response.data.seeds.map((seed) => ({
      id: randomUUID(),
      playerGoal: seed.playerGoal,
      tags: seed.tags.slice(0, 4),
      teaser: seed.teaser.slice(0, 800),
      title: seed.title.slice(0, 120),
      worldThread: seed.worldThread,
    }));
  }

  /** The origin ids on the sheet become names the seed writer can use. */
  async #resolveOriginNames(character: Character): Promise<Map<string, string>> {
    const {
      allegianceId,
      cultureReferenceId,
      homelandId,
      speciesReferenceId,
    } = character.origin;
    const [entities, species, culture] = await Promise.all([
      this.#world.listEntitiesByIds([homelandId, allegianceId]),
      this.#encyclopedia.getEntryById(speciesReferenceId),
      this.#encyclopedia.getEntryById(cultureReferenceId),
    ]);
    const names = new Map(entities.map((entity) => [entity.id, entity.name]));
    if (species !== null) {names.set(species.id, species.title);}
    if (culture !== null) {names.set(culture.id, culture.title);}
    return names;
  }

  #buildDeveloperMessages(options: GenerateAllSeedsOptions): DeveloperMessage[] {
    const messages = [
      this.#createDeveloperMessage(
        'LOCATION',
        this.#buildEntityContext(options.location, options.locationLore)
      ),
      this.#createDeveloperMessage(
        'ANCHOR',
        this.#buildEntityContext(options.anchor, options.anchorLore)
      ),
      this.#createDeveloperMessage(
        'CHARACTER',
        this.#formatSeedCharacter(options.character, options.originNames)
      ),
    ];
    if (options.encyclopediaEntries.length > 0) {
      messages.push(this.#createDeveloperMessage(
        'ENCYCLOPEDIA',
        this.#encyclopediaContext(options.encyclopediaEntries)
      ));
    }
    const toneDescription = this.#formatTone(options.toneChips, options.toneNotes);
    if (toneDescription.length > 0) {
      messages.push(this.#createDeveloperMessage('TONE', toneDescription));
    }
    return messages;
  }

  /**
   * Canon as the shared view renders it — facts, GM notes, and summarized
   * lore, with Atlas links stripped. What stood here shipped whole lore
   * fragments, each carrying the same tag array and the same one-word title,
   * and no GM notes at all.
   */
  #buildEntityContext(entity: HardState, lore: LoreFragment[]): Record<string, unknown> {
    return { ...entityView(entity, lore) };
  }

  #encyclopediaContext(entries: StoredEncyclopediaEntry[]): Record<string, unknown> {
    return {
      entries: entries.map((entry) => ({
        affordance: entry.usage.affordances[0],
        cue: entry.usage.cues[0],
        kind: entry.kind,
        slug: `encyclopedia:${entry.slug}`,
        subkind: entry.subkind,
        summary: entry.summary,
        title: entry.title,
      })),
      note: 'These are established examples, not an exhaustive inventory of what may exist.',
    };
  }

  async #loadGroundingEntries(location: HardState): Promise<StoredEncyclopediaEntry[]> {
    return loadGroundingEntries(this.#encyclopedia, location);
  }

  #buildUserMessage(options: GenerateAllSeedsOptions): string {
    const toneDescription = this.#formatTone(options.toneChips, options.toneNotes);
    const toneClause = toneDescription.length > 0
      ? ` with a ${toneDescription} tone`
      : '';
    return `Create ${options.count} diverse seeds for ${options.character.name}'s next chronicle, set in ${options.location.name} and centered on ${options.anchor.name}${toneClause}. Each seed pursues a different goal.`;
  }

  #formatSeedCharacter(
    character: Character,
    originNames: Map<string, string>
  ): Record<string, unknown> {
    return characterView(character, originNamesFrom(character, originNames));
  }

  /**
   * The same labelled-lines format the GM pipeline uses. This path rendered
   * `JSON.stringify(payload, null, 2)`, so a location block ran to 5.5k of
   * braces and repeated tag arrays for an eighty-word opening.
   */
  #createDeveloperMessage(
    key: string,
    payload: Record<string, unknown> | string
  ): DeveloperMessage {
    const body = typeof payload === 'string' ? payload : renderBlock(payload);
    return {
      content: [{
        text: `### ${key}\n${body}`,
        type: 'input_text',
      }],
      role: 'developer',
    };
  }

  async #ensurePlace(locationId: string): Promise<HardState> {
    const place = await this.#world.getEntity({ id: locationId });
    if (
      place === null
      || !place.isLocation
      || !place.playableAs.includes('chronicle_location')
    ) {
      throw new Error(`Location ${locationId} not found.`);
    }
    return place;
  }

  async #ensureAnchor(locationId: string, anchorId: string): Promise<HardState> {
    const choices = await this.#world.listFocusChoices({ locationId });
    const anchor = choices.find((entity) => entity.id === anchorId);
    if (anchor === undefined) {
      throw new Error(`Anchor entity ${anchorId} is not a focus choice for this location.`);
    }
    return anchor;
  }

  #createTemplateRuntime(playerId: string): PromptTemplateRuntime {
    return new PromptTemplateRuntime({
      manager: this.#templateManager,
      playerId: playerId.trim(),
    });
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
