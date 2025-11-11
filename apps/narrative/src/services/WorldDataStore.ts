import { randomUUID } from "node:crypto";
import type { Character, Chronicle, LocationProfile, Login, Turn } from "@glass-frontier/dto";
import type { ChronicleState } from "../types.js";
import type { CharacterProgressUpdate } from "./characterProgress.js";
import { applyCharacterSnapshotProgress } from "./characterProgress.js";

export interface WorldDataStore {
  ensureChronicle(params: {
    chronicleId?: string;
    loginId: string;
    locationId: string;
    characterId?: string;
    title?: string;
    status?: Chronicle["status"];
  }): Promise<Chronicle>;

  getChronicleState(chronicleId: string): Promise<ChronicleState | null>;

  upsertLogin(login: Login): Promise<Login>;
  getLogin(loginId: string): Promise<Login | null>;
  listLogins(): Promise<Login[]>;

  upsertLocation(location: LocationProfile): Promise<LocationProfile>;
  getLocation(locationId: string): Promise<LocationProfile | null>;
  listLocations(): Promise<LocationProfile[]>;

  upsertCharacter(character: Character): Promise<Character>;
  getCharacter(characterId: string): Promise<Character | null>;
  listCharactersByLogin(loginId: string): Promise<Character[]>;

  upsertChronicle(chronicle: Chronicle): Promise<Chronicle>;
  getChronicle(chronicleId: string): Promise<Chronicle | null>;
  listChroniclesByLogin(loginId: string): Promise<Chronicle[]>;

  addTurn(turn: Turn): Promise<Turn>;
  listChronicleTurns(chronicleId: string): Promise<Turn[]>;

  applyCharacterProgress(update: CharacterProgressUpdate): Promise<Character | null>;
}

class InMemoryWorldDataStore implements WorldDataStore {
  #logins = new Map<string, Login>();
  #locations = new Map<string, LocationProfile>();
  #characters = new Map<string, Character>();
  #chronicles = new Map<string, Chronicle>();
  #turns = new Map<string, Turn[]>();

  async ensureChronicle(params: {
    chronicleId?: string;
    loginId: string;
    locationId: string;
    characterId?: string;
    title?: string;
    status?: Chronicle["status"];
  }): Promise<Chronicle> {
    const chronicleId = params.chronicleId ?? randomUUID();
    const existing = this.#chronicles.get(chronicleId);
    if (existing) {
      return existing;
    }
    const record: Chronicle = {
      id: chronicleId,
      loginId: params.loginId,
      locationId: params.locationId,
      characterId: params.characterId,
      title: params.title?.trim() && params.title.trim().length > 0 ? params.title.trim() : "Untitled Chronicle",
      status: params.status ?? "open",
      metadata: undefined
    };
    return this.upsertChronicle(record);
  }

  async getChronicleState(chronicleId: string): Promise<ChronicleState | null> {
    const chronicle = await this.getChronicle(chronicleId);
    if (!chronicle) {
      return null;
    }
    const character = chronicle.characterId ? await this.getCharacter(chronicle.characterId) : null;
    const location = chronicle.locationId ? await this.getLocation(chronicle.locationId) : null;
    const turns = await this.listChronicleTurns(chronicleId);
    const lastTurn = turns.length ? turns[turns.length - 1] : null;
    const turnSequence = lastTurn?.turnSequence ?? -1;
    return {
      chronicleId: chronicle.id,
      turnSequence,
      chronicle,
      character,
      location,
      turns
    };
  }

  async upsertLogin(login: Login): Promise<Login> {
    this.#logins.set(login.id, login);
    return login;
  }

  async getLogin(loginId: string): Promise<Login | null> {
    return this.#logins.get(loginId) ?? null;
  }

  async listLogins(): Promise<Login[]> {
    return Array.from(this.#logins.values());
  }

  async upsertLocation(location: LocationProfile): Promise<LocationProfile> {
    this.#locations.set(location.id, location);
    return location;
  }

  async getLocation(locationId: string): Promise<LocationProfile | null> {
    return this.#locations.get(locationId) ?? null;
  }

  async listLocations(): Promise<LocationProfile[]> {
    return Array.from(this.#locations.values());
  }

  async upsertCharacter(character: Character): Promise<Character> {
    this.#characters.set(character.id, character);
    return character;
  }

  async getCharacter(characterId: string): Promise<Character | null> {
    return this.#characters.get(characterId) ?? null;
  }

  async listCharactersByLogin(loginId: string): Promise<Character[]> {
    return Array.from(this.#characters.values()).filter((character) => character.loginId === loginId);
  }

  async upsertChronicle(chronicle: Chronicle): Promise<Chronicle> {
    this.#chronicles.set(chronicle.id, chronicle);
    return chronicle;
  }

  async getChronicle(chronicleId: string): Promise<Chronicle | null> {
    return this.#chronicles.get(chronicleId) ?? null;
  }

  async listChroniclesByLogin(loginId: string): Promise<Chronicle[]> {
    return Array.from(this.#chronicles.values()).filter((chronicle) => chronicle.loginId === loginId);
  }

  async addTurn(turn: Turn): Promise<Turn> {
    const list = this.#turns.get(turn.chronicleId) ?? [];
    const existingIndex = list.findIndex((candidate) => candidate.id === turn.id);
    if (existingIndex >= 0) {
      list[existingIndex] = turn;
    } else {
      list.push(turn);
    }
    this.#turns.set(turn.chronicleId, list);
    return turn;
  }

  async listChronicleTurns(chronicleId: string): Promise<Turn[]> {
    return Array.from(this.#turns.get(chronicleId) ?? []).sort(
      (a, b) => (a.turnSequence ?? 0) - (b.turnSequence ?? 0)
    );
  }

  async applyCharacterProgress(update: CharacterProgressUpdate): Promise<Character | null> {
    if (!update.characterId) {
      return null;
    }
    const character = await this.getCharacter(update.characterId);
    if (!character || (!update.momentumDelta && !update.skill)) {
      return character;
    }
    const updated = applyCharacterSnapshotProgress(character, update);
    await this.upsertCharacter(updated);
    return updated;
  }
}

export { InMemoryWorldDataStore };
