import type { S3Client } from '@aws-sdk/client-s3';
import type { Character, Chronicle, Player, Turn } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import { randomUUID } from 'node:crypto';

import { applyCharacterSnapshotProgress } from './characterProgress';
import { HybridObjectStore } from './hybridObjectStore';
import type { LocationGraphStore } from './locationGraphStore';
import type { CharacterProgressPayload, ChronicleSnapshot } from './types';
import type { WorldIndexRepository } from './worldIndexRepository';
import type { WorldStateStore } from './worldStateStore';

const isNonEmptyString = (value?: string | null): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export class S3WorldStateStore extends HybridObjectStore implements WorldStateStore {
  readonly #index: WorldIndexRepository;
  readonly #locationGraphStore: LocationGraphStore | null;

  constructor(options: {
    bucket: string;
    prefix?: string | null;
    client?: S3Client;
    region?: string;
    worldIndex: WorldIndexRepository;
    locationGraphStore?: LocationGraphStore | null;
  }) {
    super({
      bucket: options.bucket,
      client: options.client,
      prefix: options.prefix,
      region: options.region,
    });
    if (options.worldIndex === undefined) {
      throw new Error('S3WorldStateStore requires a world index repository.');
    }
    this.#index = options.worldIndex;
    this.#locationGraphStore = options.locationGraphStore ?? null;
    const prefixValue = isNonEmptyString(options.prefix) ? options.prefix.trim() : null;
    const normalizedPrefix = prefixValue !== null ? prefixValue.replace(/\/+$/, '') : null;
    const prefixLabel =
      normalizedPrefix === null || normalizedPrefix.length === 0 ? '<root>' : normalizedPrefix;
    log(
      'info',
      `Using S3 world state store bucket=${options.bucket} prefix=${prefixLabel}`
    );
  }

  async ensureChronicle(params: {
    chronicleId?: string;
    playerId: string;
    locationId: string;
    characterId?: string;
    title?: string;
    status?: Chronicle['status'];
    seedText?: string | null;
    beatsEnabled?: boolean;
  }): Promise<Chronicle> {
    const chronicleId = params.chronicleId ?? randomUUID();
    const existing = await this.getChronicle(chronicleId);
    if (existing !== null) {
      return existing;
    }
    const record = this.#buildChronicleRecord(params, chronicleId);
    return this.upsertChronicle(record);
  }

  async getChronicleState(chronicleId: string): Promise<ChronicleSnapshot | null> {
    const chronicle = await this.getChronicle(chronicleId);
    if (chronicle === null) {
      return null;
    }
    const character = isNonEmptyString(chronicle.characterId)
      ? await this.getCharacter(chronicle.characterId)
      : null;
    const locationSummary =
      this.#locationGraphStore && isNonEmptyString(chronicle.locationId) && character?.id
        ? await this.#locationGraphStore.summarizeCharacterLocation({
            characterId: character.id,
            locationId: chronicle.locationId,
          })
        : null;
    const turns = await this.listChronicleTurns(chronicleId);
    const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
    const turnSequence = lastTurn?.turnSequence ?? -1;
    return {
      character,
      chronicle,
      chronicleId: chronicle.id,
      location: locationSummary,
      turns,
      turnSequence,
    };
  }

  async upsertCharacter(character: Character): Promise<Character> {
    const normalized = this.#ensureInventory(character);
    await this.setJson(this.#characterKey(normalized.playerId, normalized.id), normalized);
    await this.#index.linkCharacterToPlayer(normalized.id, normalized.playerId);
    return normalized;
  }

  async getCharacter(characterId: string): Promise<Character | null> {
    const playerId = await this.#resolveCharacterPlayer(characterId);
    if (playerId === null) {
      return null;
    }

    const record = await this.getJson<Character>(this.#characterKey(playerId, characterId));
    if (record !== null) {
      const normalized = this.#ensureInventory(record);
      return normalized;
    }
    return record;
  }

  async listCharactersByPlayer(playerId: string): Promise<Character[]> {
    const characterIds = await this.#index.listCharactersByPlayer(playerId);
    if (characterIds.length === 0) {
      return [];
    }
    const records = await Promise.all(
      characterIds.map(async (characterId) => {
        const record = await this.getJson<Character>(this.#characterKey(playerId, characterId));
        if (record !== null) {
          const normalized = this.#ensureInventory(record);
          return normalized;
        }
        return null;
      })
    );
    return records.filter((character): character is Character => character !== null);
  }

  async upsertPlayer(player: Player): Promise<Player> {
    await this.setJson(this.#playerKey(player.id), player);
    return player;
  }

  async getPlayer(playerId: string): Promise<Player | null> {
    return this.getJson<Player>(this.#playerKey(playerId));
  }

  async upsertChronicle(chronicle: Chronicle): Promise<Chronicle> {
    const normalized = this.#normalizeChronicle(chronicle);
    await this.setJson(this.#chronicleKey(normalized.playerId, normalized.id), normalized);
    await this.#index.linkChronicleToPlayer(chronicle.id, chronicle.playerId);
    if (isNonEmptyString(chronicle.characterId)) {
      await this.#index.linkChronicleToCharacter(chronicle.id, chronicle.characterId);
    }
    if (isNonEmptyString(chronicle.locationId)) {
      await this.#index.linkChronicleToLocation(chronicle.id, chronicle.locationId);
    }
    return normalized;
  }

  async getChronicle(chronicleId: string): Promise<Chronicle | null> {
    const playerId = await this.#resolveChroniclePlayer(chronicleId);
    if (playerId === null) {
      return null;
    }

    const record = await this.getJson<Chronicle>(this.#chronicleKey(playerId, chronicleId));
    if (record !== null) {
      const normalized = this.#normalizeChronicle(record);
      return normalized;
    }
    return record;
  }

  async listChroniclesByPlayer(playerId: string): Promise<Chronicle[]> {
    const chronicleIds = await this.#index.listChroniclesByPlayer(playerId);
    if (chronicleIds.length === 0) {
      return [];
    }
    const records = await Promise.all(
      chronicleIds.map(async (chronicleId) => {
        const record = await this.getJson<Chronicle>(this.#chronicleKey(playerId, chronicleId));
        if (record !== null) {
          const normalized = this.#normalizeChronicle(record);
          return normalized;
        }
        return record;
      })
    );
    return records.filter((chronicle): chronicle is Chronicle => chronicle !== null);
  }

  async deleteChronicle(chronicleId: string): Promise<void> {
    const chronicle = await this.getChronicle(chronicleId);
    if (chronicle === null) {
      return;
    }
    const playerId = chronicle.playerId;
    const turnKeys = await this.list(this.#turnPrefix(playerId, chronicleId), { suffix: '.json' });
    await Promise.all(turnKeys.map((key) => this.delete(key)));
    await this.delete(this.#chronicleKey(playerId, chronicleId));
    await this.#index.removeChronicleFromPlayer(chronicleId, playerId);
    await this.#index.deleteChronicleRecords(chronicleId);
  }

  async addTurn(turn: Turn): Promise<Turn> {
    const chronicleId = turn.chronicleId ?? null;
    if (!isNonEmptyString(chronicleId)) {
      throw new Error(`Chronicle ${chronicleId ?? '<unknown>'} not found for turn ${turn.id}`);
    }
    const chronicle = await this.getChronicle(chronicleId);
    if (chronicle === null) {
      throw new Error(`Chronicle ${chronicleId} not found for turn ${turn.id}`);
    }
    const key = this.#turnKey(chronicle.playerId, chronicle.id, turn.id);
    await this.setJson(key, turn);
    await this.#index.recordChronicleTurn(chronicle.id, turn.id, turn.turnSequence ?? 0);
    return turn;
  }

  async listChronicleTurns(chronicleId: string): Promise<Turn[]> {
    const playerId = await this.#resolveChroniclePlayer(chronicleId);
    if (playerId === null) {
      return [];
    }
    const pointers = await this.#index.listChronicleTurns(chronicleId);
    if (pointers.length === 0) {
      return [];
    }
    const turnRecords = await Promise.all(
      pointers.map((pointer) => this.getJson<Turn>(this.#turnKey(playerId, chronicleId, pointer.turnId)))
    );
    return turnRecords.filter((record): record is Turn => record !== null);
  }

  async applyCharacterProgress(update: CharacterProgressPayload): Promise<Character | null> {
    if (!isNonEmptyString(update.characterId)) {
      return null;
    }
    const character = await this.getCharacter(update.characterId);
    if (character === null) {
      return null;
    }
    const hasMomentumDelta =
      typeof update.momentumDelta === 'number' && update.momentumDelta !== 0;
    const hasSkillUpdate = update.skill !== undefined;
    if (!hasMomentumDelta && !hasSkillUpdate) {
      return character;
    }
    const next = applyCharacterSnapshotProgress(character, update);
    await this.upsertCharacter(next);
    return next;
  }

  async #resolveChroniclePlayer(chronicleId: string): Promise<string | null> {
    return this.#index.getChroniclePlayer(chronicleId);
  }

  async #resolveCharacterPlayer(characterId: string): Promise<string | null> {
    return this.#index.getCharacterPlayer(characterId);
  }

  #ensureInventory(character: Character): Character {
    if (character.inventory !== undefined) {
      return character;
    }
    return {
      ...character,
      inventory: [],
    };
  }

  #characterKey(playerId: string, characterId: string): string {
    return `characters/${playerId}/${characterId}.json`;
  }

  #chronicleKey(playerId: string, chronicleId: string): string {
    return `chronicles/${playerId}/${chronicleId}.json`;
  }

  #playerKey(playerId: string): string {
    return `players/${playerId}.json`;
  }

  #turnPrefix(playerId: string, chronicleId: string): string {
    return `chronicles/${playerId}/${chronicleId}/turns/`;
  }

  #turnKey(playerId: string, chronicleId: string, turnId: string): string {
    return `${this.#turnPrefix(playerId, chronicleId)}${turnId}.json`;
  }

  #normalizeChronicle(chronicle: Chronicle): Chronicle {
    const beatsEnabled =
      chronicle.beatsEnabled === undefined || chronicle.beatsEnabled === null
        ? true
        : Boolean(chronicle.beatsEnabled);
    const beats = Array.isArray(chronicle.beats) ? chronicle.beats : [];
    const summaries = Array.isArray(chronicle.summaries) ? chronicle.summaries : [];
    return {
      ...chronicle,
      beats,
      beatsEnabled,
      summaries,
    };
  }

  #buildChronicleRecord(
    params: {
      characterId?: string;
      playerId: string;
      locationId: string;
      seedText?: string | null;
      status?: Chronicle['status'];
      title?: string;
      beatsEnabled?: boolean;
    },
    chronicleId: string
  ): Chronicle {
    const seed = params.seedText?.trim() ?? null;
    const title = params.title?.trim() ?? null;
    return {
      beats: [],
      beatsEnabled: params.beatsEnabled ?? true,
      characterId: params.characterId,
      id: chronicleId,
      locationId: params.locationId,
      playerId: params.playerId,
      metadata: undefined,
      seedText: isNonEmptyString(seed) ? seed : undefined,
      status: params.status ?? 'open',
      summaries: [],
      title: isNonEmptyString(title) ? title : 'Untitled Chronicle',
    };
  }
}
