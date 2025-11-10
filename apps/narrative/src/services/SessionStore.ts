import { randomUUID } from "node:crypto";
import type { SessionState } from "../types.js";
import {Character, LocationProfile, Turn} from "@glass-frontier/dto";
import {log} from "@glass-frontier/utils";

export interface SessionStore {
  ensureSession(sessionId?: string, seed?: Partial<SessionState>): SessionState;
  getSessionState(sessionId: string): SessionState;
  setLocation(sessionId: string, loc: LocationProfile): void;
  setCharacter(sessionId: string, char: Character): void;
  addTurn(sessionId: string, turn: Turn): void;
}

export function randomLocation(): LocationProfile {
  return {
    locale: "The Frozen Wastes of Hovin Iv",
    atmosphere: "cold, bright, optimistic"
  }
}

export function randomCharacter(): Character {
  return {
    archetype: "Vibe Knight",
    attributes: {
      "vitality" : "rudimentary",
      "finesse" : "transcendent",
      "focus" : "standard",
      "resolve" : "standard",
      "attunement" : "superior",
      "ingenuity" : "superior",
      "presence" : "rudimentary",
    },
    id: "random-character",
    momentum: {
      current: 0,
      floor: -2,
      ceiling: 3
    },
    name: "Tsonu",
    pronouns: "he/him",
    skills: {
      trombone: {
        name: "trombone",
        tier: "artisan",
        attribute: "ingenuity",
        xp: 0
      }},
    tags: []
  }
}

export function buildDefaultState(sessionId: string): SessionState {
  return {
    sessionId,
    turnSequence: 0,
    character: randomCharacter(), //stub these
    location: randomLocation(),
    turns: [],
  };
}

class InMemorySessionStore implements SessionStore {
  #sessions = new Map<string, SessionState>();

  ensureSession(sessionId: string): SessionState {
    log("info", `Creating session ${sessionId}.`)
    if (!this.#sessions.has(sessionId)) {
      this.#sessions.set(sessionId, buildDefaultState(sessionId));
    }
    return this.#sessions.get(sessionId)!;
  }

  getSessionState(sessionId: string): SessionState {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return this.ensureSession(sessionId);
    }
    return session;
  }

  setCharacter(sessionId: string, char: Character): void {
    const session = this.getSessionState(sessionId);
    session.character = char;
  }

  setLocation(sessionId: string, loc: LocationProfile): void {
    const session = this.getSessionState(sessionId);
    session.location = loc;
  }

  addTurn(sessionId: string, turn: Turn): void {
    const session = this.getSessionState(sessionId);
    session.turns.push(turn)
    session.turnSequence = session.turnSequence + 1;
    if (session.turnSequence != turn.turnSequence) {
      log("warn", `Turn sequence desync session: ${session.turnSequence}, turn: ${turn.turnSequence}.`)
    }
  }
}

export { InMemorySessionStore };
