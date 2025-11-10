import { randomUUID } from "node:crypto";
import type { Character, LocationProfile, Login, SessionRecord, Turn } from "@glass-frontier/dto";
import type { SessionState } from "../types.js";

export interface SessionStore {
  ensureSession(params: {
    sessionId?: string;
    loginId: string;
    characterId?: string;
    status?: SessionRecord["status"];
  }): SessionRecord;

  getSessionState(sessionId: string): SessionState | null;

  upsertLogin(login: Login): Login;
  getLogin(loginId: string): Login | null;
  listLogins(): Login[];

  upsertLocation(location: LocationProfile): LocationProfile;
  getLocation(locationId: string): LocationProfile | null;
  listLocations(): LocationProfile[];

  upsertCharacter(character: Character): Character;
  getCharacter(characterId: string): Character | null;
  listCharactersByLogin(loginId: string): Character[];

  upsertSession(session: SessionRecord): SessionRecord;
  getSession(sessionId: string): SessionRecord | null;
  listSessionsByLogin(loginId: string): SessionRecord[];

  addTurn(turn: Turn): Turn;
  listTurns(sessionId: string): Turn[];
}

class InMemorySessionStore implements SessionStore {
  #logins = new Map<string, Login>();
  #locations = new Map<string, LocationProfile>();
  #characters = new Map<string, Character>();
  #sessions = new Map<string, SessionRecord>();
  #turns = new Map<string, Turn[]>();

  ensureSession(params: {
    sessionId?: string;
    loginId: string;
    characterId?: string;
    status?: SessionRecord["status"];
  }): SessionRecord {
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

  getSessionState(sessionId: string): SessionState | null {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }
    const character = session.characterId ? this.getCharacter(session.characterId) : null;
    const location = character?.locationId ? this.getLocation(character.locationId) : null;
    const turns = this.listTurns(sessionId);
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

  upsertLogin(login: Login): Login {
    this.#logins.set(login.id, login);
    return login;
  }

  getLogin(loginId: string): Login | null {
    return this.#logins.get(loginId) ?? null;
  }

  listLogins(): Login[] {
    return Array.from(this.#logins.values());
  }

  upsertLocation(location: LocationProfile): LocationProfile {
    this.#locations.set(location.id, location);
    return location;
  }

  getLocation(locationId: string): LocationProfile | null {
    return this.#locations.get(locationId) ?? null;
  }

  listLocations(): LocationProfile[] {
    return Array.from(this.#locations.values());
  }

  upsertCharacter(character: Character): Character {
    this.#characters.set(character.id, character);
    return character;
  }

  getCharacter(characterId: string): Character | null {
    return this.#characters.get(characterId) ?? null;
  }

  listCharactersByLogin(loginId: string): Character[] {
    return Array.from(this.#characters.values()).filter((character) => character.loginId === loginId);
  }

  upsertSession(session: SessionRecord): SessionRecord {
    this.#sessions.set(session.id, session);
    return session;
  }

  getSession(sessionId: string): SessionRecord | null {
    return this.#sessions.get(sessionId) ?? null;
  }

  listSessionsByLogin(loginId: string): SessionRecord[] {
    return Array.from(this.#sessions.values()).filter((session) => session.loginId === loginId);
  }

  addTurn(turn: Turn): Turn {
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

  listTurns(sessionId: string): Turn[] {
    return Array.from(this.#turns.get(sessionId) ?? []).sort(
      (a, b) => (a.turnSequence ?? 0) - (b.turnSequence ?? 0)
    );
  }
}

export { InMemorySessionStore };
