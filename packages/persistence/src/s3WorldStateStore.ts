import type { S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import type { Character, Chronicle, Login, Player, Turn } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import { HybridObjectStore } from './hybridObjectStore';
import type { WorldStateStore } from './worldStateStore';
import type { CharacterProgressPayload, ChronicleSnapshot } from './types';
import { applyCharacterSnapshotProgress } from './characterProgress';
import { WorldIndexRepository } from './worldIndexRepository';

export class S3WorldStateStore extends HybridObjectStore implements WorldStateStore {
  #index: WorldIndexRepository;

  #logins = new Map<string, Login>();
  #characters = new Map<string, Character>();
  #chronicles = new Map<string, Chronicle>();
  #chronicleLoginIndex = new Map<string, string>();
  #characterLoginIndex = new Map<string, string>();
  #players = new Map<string, Player>();

  constructor(options: {
    bucket: string;
    prefix?: string | null;
    client?: S3Client;
    region?: string;
    worldIndex: WorldIndexRepository;
  }) {
    super({
      bucket: options.bucket,
      prefix: options.prefix,
      client: options.client,
      region: options.region,
    });
    if (!options.worldIndex) {
      throw new Error('S3WorldStateStore requires a world index repository.');
    }
    this.#index = options.worldIndex;
    log(
      'info',
      `Using S3 world state store bucket=${options.bucket} prefix=${options.prefix ? options.prefix.replace(/\/+$/, '') || '<root>' : '<root>'}`
    );
  }

  async ensureChronicle(params: {
    chronicleId?: string;
    loginId: string;
    locationId: string;
    characterId?: string;
    title?: string;
    status?: Chronicle['status'];
  }): Promise<Chronicle> {
    const chronicleId = params.chronicleId ?? randomUUID();
    const existing = await this.getChronicle(chronicleId);
    if (existing) {
      return existing;
    }
    const record: Chronicle = {
      id: chronicleId,
      loginId: params.loginId,
      locationId: params.locationId,
      characterId: params.characterId,
      title:
        params.title?.trim() && params.title.trim().length > 0
          ? params.title.trim()
          : 'Untitled Chronicle',
      status: params.status ?? 'open',
      metadata: undefined,
    };
    return this.upsertChronicle(record);
  }

  async getChronicleState(chronicleId: string): Promise<ChronicleSnapshot | null> {
    const chronicle = await this.getChronicle(chronicleId);
    if (!chronicle) {
      return null;
    }
    const character = chronicle.characterId ? await this.getCharacter(chronicle.characterId) : null;
    const turns = await this.listChronicleTurns(chronicleId);
    const lastTurn = turns.length ? turns[turns.length - 1] : null;
    const turnSequence = lastTurn?.turnSequence ?? -1;
    return {
      chronicleId: chronicle.id,
      turnSequence,
      chronicle,
      character,
      location: null,
      turns,
    };
  }

  async upsertLogin(login: Login): Promise<Login> {
    this.#logins.set(login.id, login);
    await this.setJson(this.#loginKey(login.id), login);
    return login;
  }

  async getLogin(loginId: string): Promise<Login | null> {
    const cached = this.#logins.get(loginId);
    if (cached) return cached;
    const record = await this.getJson<Login>(this.#loginKey(loginId));
    if (record) {
      this.#logins.set(loginId, record);
    }
    return record;
  }

  async listLogins(): Promise<Login[]> {
    const keys = await this.list('logins/', { suffix: '.json' });
    const records = await Promise.all(keys.map((key) => this.getJson<Login>(key)));
    return records.filter((login): login is Login => Boolean(login));
  }

  async upsertCharacter(character: Character): Promise<Character> {
    this.#characters.set(character.id, character);
    this.#characterLoginIndex.set(character.id, character.loginId);
    await this.setJson(this.#characterKey(character.loginId, character.id), character);
    await this.#index.linkCharacterToLogin(character.id, character.loginId);
    return character;
  }

  async getCharacter(characterId: string): Promise<Character | null> {
    const cached = this.#characters.get(characterId);
    if (cached) return cached;

    const loginId = await this.#resolveCharacterLogin(characterId);
    if (!loginId) return null;

    const record = await this.getJson<Character>(this.#characterKey(loginId, characterId));
    if (record) {
      this.#characters.set(characterId, record);
      this.#characterLoginIndex.set(characterId, loginId);
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
        if (cached) return cached;
        const record = await this.getJson<Character>(this.#characterKey(loginId, characterId));
        if (record) {
          this.#characters.set(characterId, record);
          this.#characterLoginIndex.set(characterId, loginId);
        }
        return record;
      })
    );
    return records.filter((character): character is Character => Boolean(character));
  }

  async upsertPlayer(player: Player): Promise<Player> {
    this.#players.set(player.loginId, player);
    await this.setJson(this.#playerKey(player.loginId), player);
    return player;
  }

  async getPlayer(loginId: string): Promise<Player | null> {
    const cached = this.#players.get(loginId);
    if (cached) return cached;
    const record = await this.getJson<Player>(this.#playerKey(loginId));
    if (record) {
      this.#players.set(loginId, record);
    }
    return record;
  }

  async upsertChronicle(chronicle: Chronicle): Promise<Chronicle> {
    this.#chronicles.set(chronicle.id, chronicle);
    this.#chronicleLoginIndex.set(chronicle.id, chronicle.loginId);
    await this.setJson(this.#chronicleKey(chronicle.loginId, chronicle.id), chronicle);
    await this.#index.linkChronicleToLogin(chronicle.id, chronicle.loginId);
    if (chronicle.characterId) {
      await this.#index.linkChronicleToCharacter(chronicle.id, chronicle.characterId);
    }
    if (chronicle.locationId) {
      await this.#index.linkChronicleToLocation(chronicle.id, chronicle.locationId);
    }
    return chronicle;
  }

  async getChronicle(chronicleId: string): Promise<Chronicle | null> {
    const cached = this.#chronicles.get(chronicleId);
    if (cached) return cached;

    const loginId = await this.#resolveChronicleLogin(chronicleId);
    if (!loginId) return null;

    const record = await this.getJson<Chronicle>(this.#chronicleKey(loginId, chronicleId));
    if (record) {
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
        if (cached) return cached;
        const record = await this.getJson<Chronicle>(this.#chronicleKey(loginId, chronicleId));
        if (record) {
          this.#chronicles.set(chronicleId, record);
          this.#chronicleLoginIndex.set(chronicleId, loginId);
        }
        return record;
      })
    );
    return records.filter((chronicle): chronicle is Chronicle => Boolean(chronicle));
  }

  async addTurn(turn: Turn): Promise<Turn> {
    const chronicleId = turn.chronicleId;
    const chronicle = chronicleId ? await this.getChronicle(chronicleId) : null;
    if (!chronicle || !chronicleId) {
      throw new Error(`Chronicle ${chronicleId ?? '<unknown>'} not found for turn ${turn.id}`);
    }
    const key = this.#turnKey(chronicle.loginId, chronicle.id, turn.id);
    await this.setJson(key, turn);
    await this.#index.recordChronicleTurn(chronicle.id, turn.id, turn.turnSequence ?? 0);
    return turn;
  }

  async listChronicleTurns(chronicleId: string): Promise<Turn[]> {
    const loginId = await this.#resolveChronicleLogin(chronicleId);
    if (!loginId) {
      return [];
    }
    const pointers = await this.#index.listChronicleTurns(chronicleId);
    if (pointers.length === 0) {
      return [];
    }
    const turns: Turn[] = [];
    for (const pointer of pointers) {
      const record = await this.getJson<Turn>(this.#turnKey(loginId, chronicleId, pointer.turnId));
      if (record) {
        turns.push(record);
      }
    }
    return turns;
  }

  async applyCharacterProgress(update: CharacterProgressPayload): Promise<Character | null> {
    if (!update.characterId) {
      return null;
    }
    const character = await this.getCharacter(update.characterId);
    if (!character || (!update.momentumDelta && !update.skill)) {
      return character;
    }
    const next = applyCharacterSnapshotProgress(character, update);
    await this.upsertCharacter(next);
    return next;
  }

  async #resolveChronicleLogin(chronicleId: string): Promise<string | null> {
    if (this.#chronicleLoginIndex.has(chronicleId)) {
      return this.#chronicleLoginIndex.get(chronicleId)!;
    }
    const loginId = await this.#index.getChronicleLogin(chronicleId);
    if (loginId) {
      this.#chronicleLoginIndex.set(chronicleId, loginId);
      return loginId;
    }
    return null;
  }

  async #resolveCharacterLogin(characterId: string): Promise<string | null> {
    if (this.#characterLoginIndex.has(characterId)) {
      return this.#characterLoginIndex.get(characterId)!;
    }
    const loginId = await this.#index.getCharacterLogin(characterId);
    if (loginId) {
      this.#characterLoginIndex.set(characterId, loginId);
      return loginId;
    }
    return null;
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
