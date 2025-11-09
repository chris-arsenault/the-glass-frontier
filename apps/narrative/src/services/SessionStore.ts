import { randomUUID } from "node:crypto";
import type {
  CheckRequestEnvelope,
  CheckResolution,
  SessionShard,
  SessionState,
  TranscriptEntry
} from "../types.js";

export interface SessionStore {
  ensureSession(sessionId?: string, seed?: Partial<SessionState>): SessionState;
  getSessionState(sessionId: string): SessionState;
  appendTranscript(sessionId: string, entry: TranscriptEntry): SessionState;
  recordCheckRequest(sessionId: string, request: CheckRequestEnvelope): void;
  recordCheckResolution(sessionId: string, resolution: CheckResolution): void;
  recordCheckVeto(sessionId: string, payload: CheckResolution): void;
  incrementTurn(sessionId: string): void;
}

function buildDefaultState(sessionId: string, seed?: Partial<SessionState>): SessionState {
  return {
    sessionId,
    turnSequence: seed?.turnSequence ?? 0,
    character: seed?.character,
    location: seed?.location,
    momentum: seed?.momentum ?? { current: 0, floor: -2, ceiling: 3 },
    shards: seed?.shards ?? {},
    transcript: seed?.transcript ?? [],
    resolvedChecks: seed?.resolvedChecks ?? []
  };
}

class InMemorySessionStore implements SessionStore {
  #sessions = new Map<string, SessionState>();

  ensureSession(sessionId: string = randomUUID(), seed?: Partial<SessionState>): SessionState {
    if (!this.#sessions.has(sessionId)) {
      this.#sessions.set(sessionId, buildDefaultState(sessionId, seed));
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

  appendTranscript(sessionId: string, entry: TranscriptEntry): SessionState {
    const session = this.getSessionState(sessionId);
    session.transcript.push(entry);
    return session;
  }

  recordCheckRequest(sessionId: string, request: CheckRequestEnvelope): void {
    const session = this.getSessionState(sessionId);
    session.pendingChecks = [...session.pendingChecks, request];
  }

  recordCheckResolution(sessionId: string, resolution: CheckResolution): void {
    const session = this.getSessionState(sessionId);
    session.resolvedChecks = [...session.resolvedChecks, resolution];
    session.pendingChecks = session.pendingChecks.filter((entry) => entry.id !== resolution.id);
  }

  recordCheckVeto(sessionId: string, payload: CheckResolution): void {
    this.recordCheckResolution(sessionId, payload);
  }

  incrementTurn(sessionId: string): void {
    const session = this.getSessionState(sessionId);
    session.turnSequence += 1;
  }

  upsertShard(sessionId: string, shardId: string, shard: SessionShard): void {
    const session = this.getSessionState(sessionId);
    session.shards[shardId] = shard;
  }
}

export { InMemorySessionStore };
