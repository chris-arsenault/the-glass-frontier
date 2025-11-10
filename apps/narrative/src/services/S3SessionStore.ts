import { randomUUID } from "node:crypto";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command
} from "@aws-sdk/client-s3";
import { fromEnv } from "@aws-sdk/credential-providers";

import type { Character, LocationProfile, Turn } from "@glass-frontier/dto";
import { log } from "@glass-frontier/utils";

import type { SessionState } from "../types.js";
import type { SessionStore } from "./SessionStore.js";
import { buildDefaultState } from "./SessionStore.js";

type SessionDocument = {
  sessionId: string;
  turnSequence: number;
  turnCount: number;
  characterId: string | null;
  locationKey: string | null;
};

type S3SessionStoreOptions = {
  bucket: string;
  prefix?: string;
  client?: S3Client;
  syncTimeoutMs?: number;
};

const DEFAULT_TIMEOUT = 45_000;

function isNotFound(error: unknown): boolean {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404;
}

export class S3SessionStore implements SessionStore {
  #bucket: string;
  #prefix: string;
  #client: S3Client;
  #timeout: number;
  #cache = new Map<string, SessionState>();

  constructor(options: S3SessionStoreOptions) {
    if (!options.bucket) {
      throw new Error("S3SessionStore requires a bucket name.");
    }
    log("info", `Creating S3 backed session with bucket: ${options.bucket}`);
    this.#bucket = options.bucket;
    this.#prefix = options.prefix ? options.prefix.replace(/\/+$/, "") + "/" : "";
    const credentials =
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? fromEnv()
        : undefined;

    this.#client =
      options.client ??
      new S3Client({
        region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
        credentials
      });
    this.#timeout = options.syncTimeoutMs ?? DEFAULT_TIMEOUT;
  }

  ensureSession(sessionId?: string, seed?: Partial<SessionState>): SessionState {
    const id = sessionId ?? randomUUID();
    if (this.#cache.has(id)) {
      return this.#cache.get(id)!;
    }

    const stored = this.#loadSession(id);
    if (stored) {
      this.#cache.set(id, stored);
      return stored;
    }

    const session = { ...buildDefaultState(id), ...seed };
    this.#cache.set(id, session as SessionState);
    this.#persistFullSession(session as SessionState);
    return session as SessionState;
  }

  getSessionState(sessionId: string): SessionState {
    if (this.#cache.has(sessionId)) {
      return this.#cache.get(sessionId)!;
    }

    return this.ensureSession(sessionId);
  }

  setLocation(sessionId: string, loc: LocationProfile): void {
    const session = this.getSessionState(sessionId);
    session.location = loc;
    this.#persistLocation(sessionId, loc);
    this.#persistSessionSummary(session);
  }

  setCharacter(sessionId: string, char: Character): void {
    const session = this.getSessionState(sessionId);
    session.character = char;
    this.#persistCharacter(char);
    this.#persistSessionSummary(session);
  }

  addTurn(sessionId: string, turn: Turn): void {
    const session = this.getSessionState(sessionId);
    session.turns.push(turn);
    session.turnSequence = session.turnSequence + 1;
    if ((turn.turnSequence ?? session.turnSequence) !== session.turnSequence) {
      log(
        "warn",
        `Turn sequence desync session: ${session.turnSequence}, turn: ${turn.turnSequence}.`
      );
    }
    this.#persistTurn(session, turn);
    this.#persistSessionSummary(session);
  }

  #loadSession(sessionId: string): SessionState | null {
    const summary = this.#readJson<SessionDocument>(this.#sessionSummaryKey(sessionId));
    if (!summary) {
      return null;
    }

    const character = summary.characterId
      ? this.#readJson<Character>(this.#characterKey(summary.characterId))
      : undefined;
    const location = summary.locationKey
      ? this.#readJson<LocationProfile>(this.#locationKey(summary.locationKey))
      : undefined;
    const turns = this.#readTurns(sessionId);

    return {
      sessionId,
      turnSequence: summary.turnSequence,
      character,
      location,
      turns
    };
  }

  #readTurns(sessionId: string): Turn[] {
    const prefix = this.#sessionTurnsPrefix(sessionId);
    const turns: Turn[] = [];
    let continuationToken: string | undefined;

    do {
      this.#client.send(
        new ListObjectsV2Command({
          Bucket: this.#bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken
        })
      )

      for (const entry of page.Contents ?? []) {
        if (!entry.Key) continue;
        const turn = this.#readJson<Turn>(entry.Key);
        if (turn) {
          turns.push(turn);
        }
      }

      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    return turns.sort((a, b) => (a.turnSequence ?? 0) - (b.turnSequence ?? 0));
  }

  #persistFullSession(session: SessionState): void {
    if (session.character) {
      this.#persistCharacter(session.character);
    }
    if (session.location) {
      this.#persistLocation(session.sessionId, session.location);
    }
    this.#persistSessionSummary(session);
    session.turns.forEach((turn) => this.#persistTurn(session, turn));
  }

  #persistSessionSummary(session: SessionState): void {
    const document: SessionDocument = {
      sessionId: session.sessionId,
      turnSequence: session.turnSequence,
      turnCount: session.turns.length,
      characterId: session.character?.id ?? null,
      locationKey: session.location ? session.sessionId : null
    };

    this.#writeJson(this.#sessionSummaryKey(session.sessionId), document);
  }

  #persistCharacter(character: Character): void {
    this.#writeJson(this.#characterKey(character.id), character);
  }

  #persistLocation(sessionId: string, location: LocationProfile): void {
    this.#writeJson(this.#locationKey(sessionId), location);
  }

  #persistTurn(session: SessionState, turn: Turn): void {
    const sequence = turn.turnSequence ?? session.turns.length;
    const key = this.#turnKey(session.sessionId, sequence);
    this.#writeJson(key, turn);
  }

  #readJson<T>(key: string): T | null {
    try {
      const output =  this.#client.send(
        new GetObjectCommand({
          Bucket: this.#bucket,
          Key: key
        })
      )
      const body = output.Body!.transformToString();
      if (!body) {
        return null;
      }
      return JSON.parse(body) as T;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  #writeJson(key: string, payload: unknown): void {
    this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        Body: JSON.stringify(payload, null, 2),
        ContentType: "application/json"
      })
    )
  }

  #sessionSummaryKey(sessionId: string): string {
    return `${this.#prefix}sessions/${sessionId}.json`;
  }

  #sessionTurnsPrefix(sessionId: string): string {
    return `${this.#prefix}sessions/${sessionId}/turns/`;
  }

  #turnKey(sessionId: string, turnSequence: number): string {
    return `${this.#sessionTurnsPrefix(sessionId)}${String(turnSequence).padStart(6, "0")}.json`;
  }

  #characterKey(characterId: string): string {
    return `${this.#prefix}characters/${characterId}.json`;
  }

  #locationKey(sessionId: string): string {
    return `${this.#prefix}locations/${sessionId}.json`;
  }
}
