import { randomUUID } from "node:crypto";
import type { Character, LocationProfile, Login, SessionRecord, Turn } from "@glass-frontier/dto";
import type { SessionState } from "../types.js";

export interface SessionStore {
  ensureSession(params: {
    sessionId?: string;
    loginId: string;
    characterId?: string;
    status?: SessionRecord["status"];
  }): Promise<SessionRecord>;

  getSessionState(sessionId: string): Promise<SessionState | null>;

  upsertLogin(login: Login): Promise<Login>;
  getLogin(loginId: string): Promise<Login | null>;
  listLogins(): Promise<Login[]>;

  upsertLocation(location: LocationProfile): Promise<LocationProfile>;
  getLocation(locationId: string): Promise<LocationProfile | null>;
  listLocations(): Promise<LocationProfile[]>;

  upsertCharacter(character: Character): Promise<Character>;
  getCharacter(characterId: string): Promise<Character | null>;
  listCharactersByLogin(loginId: string): Promise<Character[]>;

  upsertSession(session: SessionRecord): Promise<SessionRecord>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  listSessionsByLogin(loginId: string): Promise<SessionRecord[]>;

  addTurn(turn: Turn): Promise<Turn>;
  listTurns(sessionId: string): Promise<Turn[]>;
}

class InMemorySessionStore implements SessionStore {
  #logins = new Map<string, Login>();
  #locations = new Map<string, LocationProfile>();
  #characters = new Map<string, Character>();
  #sessions = new Map<string, SessionRecord>();
  #turns = new Map<string, Turn[]>();

  async ensureSession(params: {
    sessionId?: string;
    loginId: string;
    characterId?: string;
    status?: SessionRecord["status"];
  }): Promise<SessionRecord> {
    const sessionId = params.sessionId ?? randomUUID();
    const existing = this.#sessions.get(sessionId);
    if (existing) {
      return existing;
    }
    const record: SessionRecord = {
      id: sessionId,
      loginId: params.loginId,
      characterId: params.characterId,
      status: params.status ?? "open",
      metadata: undefined
    };
    return this.upsertSession(record);
  }

  async getSessionState(sessionId: string): Promise<SessionState | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }
    const character = session.characterId ? await this.getCharacter(session.characterId) : null;
    const location = character?.locationId ? await this.getLocation(character.locationId) : null;
    const turns = await this.listTurns(sessionId);
    const lastTurn = turns.length ? turns[turns.length - 1] : null;
    const turnSequence = lastTurn?.turnSequence ?? -1;
    return {
      sessionId: session.id,
      turnSequence,
      session,
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

  async upsertSession(session: SessionRecord): Promise<SessionRecord> {
    this.#sessions.set(session.id, session);
    return session;
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    return this.#sessions.get(sessionId) ?? null;
  }

  async listSessionsByLogin(loginId: string): Promise<SessionRecord[]> {
    return Array.from(this.#sessions.values()).filter((session) => session.loginId === loginId);
  }

  async addTurn(turn: Turn): Promise<Turn> {
    const list = this.#turns.get(turn.sessionId) ?? [];
    const existingIndex = list.findIndex((candidate) => candidate.id === turn.id);
    if (existingIndex >= 0) {
      list[existingIndex] = turn;
    } else {
      list.push(turn);
    }
    this.#turns.set(turn.sessionId, list);
    return turn;
  }

  async listTurns(sessionId: string): Promise<Turn[]> {
    return Array.from(this.#turns.get(sessionId) ?? []).sort(
      (a, b) => (a.turnSequence ?? 0) - (b.turnSequence ?? 0)
    );
  }
}

export { InMemorySessionStore };
