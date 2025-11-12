import type { S3Client } from '@aws-sdk/client-s3';
import type { Character, Chronicle, Login, Player, Turn } from '@glass-frontier/dto';
import { createEmptyInventory } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import { randomUUID } from 'node:crypto';

import { applyCharacterSnapshotProgress } from './characterProgress';
import { HybridObjectStore } from './hybridObjectStore';
import type { CharacterProgressPayload, ChronicleSnapshot } from './types';
import type { WorldIndexRepository } from './worldIndexRepository';
import type { WorldStateStore } from './worldStateStore';

const isNonEmptyString = (value?: string | null): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export class S3WorldStateStore extends HybridObjectStore implements WorldStateStore {
  readonly #index: WorldIndexRepository;

  readonly #logins = new Map<string, Login>();
  readonly #characters = new Map<string, Character>();
  readonly #chronicles = new Map<string, Chronicle>();
  readonly #chronicleLoginIndex = new Map<string, string>();
  readonly #characterLoginIndex = new Map<string, string>();
  readonly #players = new Map<string, Player>();

  constructor(options: {
    bucket: string;
    prefix?: string | null;
    client?: S3Client;
    region?: string;
    worldIndex: WorldIndexRepository;
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
    loginId: string;
    locationId: string;
    characterId?: string;
    title?: string;
    status?: Chronicle['status'];
    seedText?: string | null;
  }): Promise<Chronicle> {
    const chronicleId = params.chronicleId ?? randomUUID();
    const existing = await this.getChronicle(chronicleId);
    if (existing !== null) {
      return existing;
    }
    const seed = params.seedText?.trim() ?? null;
    const title = params.title?.trim() ?? null;
    const record: Chronicle = {
      characterId: params.characterId,
      id: chronicleId,
      locationId: params.locationId,
      loginId: params.loginId,
      metadata: undefined,
      seedText: isNonEmptyString(seed) ? seed : undefined,
      status: params.status ?? 'open',
      title: isNonEmptyString(title) ? title : 'Untitled Chronicle',
    };
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
    const turns = await this.listChronicleTurns(chronicleId);
    const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
    const turnSequence = lastTurn?.turnSequence ?? -1;
    return {
      character,
      chronicle,
      chronicleId: chronicle.id,
      location: null,
      turns,
      turnSequence,
    };
  }

  async upsertLogin(login: Login): Promise<Login> {
    this.#logins.set(login.id, login);
    await this.setJson(this.#loginKey(login.id), login);
    return login;
  }

  async getLogin(loginId: string): Promise<Login | null> {
    const cached = this.#logins.get(loginId);
    if (cached !== undefined) {
      return cached;
    }
    const record = await this.getJson<Login>(this.#loginKey(loginId));
    if (record !== null) {
      this.#logins.set(loginId, record);
    }
    return record;
  }

  async listLogins(): Promise<Login[]> {
    const keys = await this.list('logins/', { suffix: '.json' });
    const records = await Promise.all(keys.map((key) => this.getJson<Login>(key)));
    return records.filter((login): login is Login => login !== null);
  }

  async upsertCharacter(character: Character): Promise<Character> {
    const normalized = this.#ensureInventory(character);
    this.#characters.set(normalized.id, normalized);
    this.#characterLoginIndex.set(normalized.id, normalized.loginId);
    await this.setJson(this.#characterKey(normalized.loginId, normalized.id), normalized);
    await this.#index.linkCharacterToLogin(normalized.id, normalized.loginId);
    return normalized;
  }

  async getCharacter(characterId: string): Promise<Character | null> {
    const cached = this.#characters.get(characterId);
    if (cached !== undefined) {
      return cached;
    }

    const loginId = await this.#resolveCharacterLogin(characterId);
    if (loginId === null) {
      return null;
    }

    const record = await this.getJson<Character>(this.#characterKey(loginId, characterId));
    if (record !== null) {
      const normalized = this.#ensureInventory(record);
      this.#characters.set(characterId, normalized);
      this.#characterLoginIndex.set(characterId, loginId);
      return normalized;
    }
    return record;
  }

  async listCharactersByLogin(loginId: string): Promise<Character[]> {
    const characterIds = await this.#index.listCharactersByLogin(loginId);
    if (characterIds.length === 0) {
      return [];
    }
    const records = await Promise.all(
      characterIds.map(async (characterId) => {
        const cached = this.#characters.get(characterId);
        if (cached !== undefined) {
          return cached;
        }
        const record = await this.getJson<Character>(this.#characterKey(loginId, characterId));
        if (record !== null) {
          const normalized = this.#ensureInventory(record);
          this.#characters.set(characterId, normalized);
          this.#characterLoginIndex.set(characterId, loginId);
          return normalized;
        }
        return null;
      })
    );
    return records.filter((character): character is Character => character !== null);
  }

  async upsertPlayer(player: Player): Promise<Player> {
    this.#players.set(player.loginId, player);
    await this.setJson(this.#playerKey(player.loginId), player);
    return player;
  }

  async getPlayer(loginId: string): Promise<Player | null> {
    const cached = this.#players.get(loginId);
    if (cached !== undefined) {
      return cached;
    }
    const record = await this.getJson<Player>(this.#playerKey(loginId));
    if (record !== null) {
      this.#players.set(loginId, record);
    }
    return record;
  }

  async upsertChronicle(chronicle: Chronicle): Promise<Chronicle> {
    this.#chronicles.set(chronicle.id, chronicle);
    this.#chronicleLoginIndex.set(chronicle.id, chronicle.loginId);
    await this.setJson(this.#chronicleKey(chronicle.loginId, chronicle.id), chronicle);
    await this.#index.linkChronicleToLogin(chronicle.id, chronicle.loginId);
    if (isNonEmptyString(chronicle.characterId)) {
      await this.#index.linkChronicleToCharacter(chronicle.id, chronicle.characterId);
    }
    if (isNonEmptyString(chronicle.locationId)) {
      await this.#index.linkChronicleToLocation(chronicle.id, chronicle.locationId);
    }
    return chronicle;
  }

  async getChronicle(chronicleId: string): Promise<Chronicle | null> {
    const cached = this.#chronicles.get(chronicleId);
    if (cached !== undefined) {
      return cached;
    }

    const loginId = await this.#resolveChronicleLogin(chronicleId);
    if (loginId === null) {
      return null;
    }

    const record = await this.getJson<Chronicle>(this.#chronicleKey(loginId, chronicleId));
    if (record !== null) {
      this.#chronicles.set(chronicleId, record);
      this.#chronicleLoginIndex.set(chronicleId, loginId);
    }
    return record;
  }

  async listChroniclesByLogin(loginId: string): Promise<Chronicle[]> {
    const chronicleIds = await this.#index.listChroniclesByLogin(loginId);
    if (chronicleIds.length === 0) {
      return [];
    }
    const records = await Promise.all(
      chronicleIds.map(async (chronicleId) => {
        const cached = this.#chronicles.get(chronicleId);
        if (cached !== undefined) {
          return cached;
        }
        const record = await this.getJson<Chronicle>(this.#chronicleKey(loginId, chronicleId));
        if (record !== null) {
          this.#chronicles.set(chronicleId, record);
          this.#chronicleLoginIndex.set(chronicleId, loginId);
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
    const loginId = chronicle.loginId;
    const turnKeys = await this.list(this.#turnPrefix(loginId, chronicleId), { suffix: '.json' });
    await Promise.all(turnKeys.map((key) => this.delete(key)));
    await this.delete(this.#chronicleKey(loginId, chronicleId));
    this.#chronicles.delete(chronicleId);
    this.#chronicleLoginIndex.delete(chronicleId);
    await this.#index.removeChronicleFromLogin(chronicleId, loginId);
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
    const key = this.#turnKey(chronicle.loginId, chronicle.id, turn.id);
    await this.setJson(key, turn);
    await this.#index.recordChronicleTurn(chronicle.id, turn.id, turn.turnSequence ?? 0);
    return turn;
  }

  async listChronicleTurns(chronicleId: string): Promise<Turn[]> {
    const loginId = await this.#resolveChronicleLogin(chronicleId);
    if (loginId === null) {
      return [];
    }
    const pointers = await this.#index.listChronicleTurns(chronicleId);
    if (pointers.length === 0) {
      return [];
    }
    const turnRecords = await Promise.all(
      pointers.map((pointer) => this.getJson<Turn>(this.#turnKey(loginId, chronicleId, pointer.turnId)))
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

  async #resolveChronicleLogin(chronicleId: string): Promise<string | null> {
    const cached = this.#chronicleLoginIndex.get(chronicleId);
    if (cached !== undefined) {
      return cached;
    }
    const loginId = await this.#index.getChronicleLogin(chronicleId);
    if (loginId !== null) {
      this.#chronicleLoginIndex.set(chronicleId, loginId);
      return loginId;
    }
    return null;
  }

  async #resolveCharacterLogin(characterId: string): Promise<string | null> {
    const cached = this.#characterLoginIndex.get(characterId);
    if (cached !== undefined) {
      return cached;
    }
    const loginId = await this.#index.getCharacterLogin(characterId);
    if (loginId !== null) {
      this.#characterLoginIndex.set(characterId, loginId);
      return loginId;
    }
    return null;
  }

  #ensureInventory(character: Character): Character {
    if (character.inventory !== undefined) {
      return character;
    }
    return {
      ...character,
      inventory: createEmptyInventory(),
    };
  }

  #loginKey(loginId: string): string {
    return `logins/${loginId}.json`;
  }

  #characterKey(loginId: string, characterId: string): string {
    return `characters/${loginId}/${characterId}.json`;
  }

  #chronicleKey(loginId: string, chronicleId: string): string {
    return `chronicles/${loginId}/${chronicleId}.json`;
  }

  #playerKey(loginId: string): string {
    return `players/${loginId}.json`;
  }

  #turnPrefix(loginId: string, chronicleId: string): string {
    return `chronicles/${loginId}/${chronicleId}/turns/`;
  }

  #turnKey(loginId: string, chronicleId: string, turnId: string): string {
    return `${this.#turnPrefix(loginId, chronicleId)}${turnId}.json`;
  }
}
