import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command
} from "@aws-sdk/client-s3";
import { fromEnv } from "@aws-sdk/credential-providers";
import { randomUUID } from "node:crypto";
import type { Character, LocationProfile, Login, SessionRecord, Turn } from "@glass-frontier/dto";
import { log } from "@glass-frontier/utils";

import type { SessionStore } from "./SessionStore.js";
import type { SessionState } from "../types.js";

const DEFAULT_TIMEOUT = 45_000;

function blockOn<T>(promise: Promise<T>, timeoutMs = DEFAULT_TIMEOUT): T {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  let result: T | undefined;
  let error: unknown;
  let settled = false;

  promise
    .then((value) => {
      result = value;
      settled = true;
      Atomics.store(view, 0, 1);
      Atomics.notify(view, 0);
    })
    .catch((err) => {
      error = err;
      settled = true;
      Atomics.store(view, 0, 1);
      Atomics.notify(view, 0);
    });

  const status = Atomics.wait(view, 0, 0, timeoutMs);

  if (!settled && status === "timed-out") {
    throw new Error("S3 operation timed out.");
  }

  if (error) {
    throw error;
  }

  return result as T;
}

function isNotFound(error: unknown): boolean {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404;
}

export class S3SessionStore implements SessionStore {
  #bucket: string;
  #prefix: string;
  #timeout: number;
  #client: S3Client;

  #logins = new Map<string, Login>();
  ensureSession(params: {
    sessionId?: string;
    loginId: string;
    characterId?: string;
    status?: SessionRecord["status"];
  }): SessionRecord {
    const sessionId = params.sessionId ?? randomUUID();
    const existing = this.getSession(sessionId);
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

  #locations = new Map<string, LocationProfile>();
  #characters = new Map<string, Character>();
  #sessions = new Map<string, SessionRecord>();
  #sessionLoginIndex = new Map<string, string>();
  #characterLoginIndex = new Map<string, string>();

  constructor(options: { bucket: string; prefix?: string; client?: S3Client; timeoutMs?: number }) {
    if (!options.bucket) {
      throw new Error("S3SessionStore requires a bucket name.");
    }
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
    this.#timeout = options.timeoutMs ?? DEFAULT_TIMEOUT;
    log("info", `Using S3 session store bucket=${this.#bucket} prefix=${this.#prefix || "<root>"}`);
  }

  upsertLogin(login: Login): Login {
    this.#logins.set(login.id, login);
    this.#writeJson(this.#loginKey(login.id), login);
    return login;
  }

  getLogin(loginId: string): Login | null {
    const cached = this.#logins.get(loginId);
    if (cached) return cached;
    const record = this.#readJson<Login>(this.#loginKey(loginId));
    if (record) {
      this.#logins.set(loginId, record);
    }
    return record;
  }

  listLogins(): Login[] {
    const keys = this.#listKeys(`${this.#prefix}logins/`);
    return keys
      .map((key) => this.#readJson<Login>(key))
      .filter((login): login is Login => Boolean(login));
  }

  upsertLocation(location: LocationProfile): LocationProfile {
    this.#locations.set(location.id, location);
    this.#writeJson(this.#locationKey(location.id), location);
    return location;
  }

  getLocation(locationId: string): LocationProfile | null {
    const cached = this.#locations.get(locationId);
    if (cached) return cached;
    const record = this.#readJson<LocationProfile>(this.#locationKey(locationId));
    if (record) {
      this.#locations.set(locationId, record);
    }
    return record;
  }

  listLocations(): LocationProfile[] {
    const keys = this.#listKeys(`${this.#prefix}locations/`);
    return keys
      .map((key) => this.#readJson<LocationProfile>(key))
      .filter((loc): loc is LocationProfile => Boolean(loc));
  }

  upsertCharacter(character: Character): Character {
    this.#characters.set(character.id, character);
    this.#characterLoginIndex.set(character.id, character.loginId);
    this.#writeJson(this.#characterKey(character.loginId, character.id), character);
    this.#writeJson(this.#characterIndexKey(character.id), { loginId: character.loginId });
    return character;
  }

  getCharacter(characterId: string): Character | null {
    const cached = this.#characters.get(characterId);
    if (cached) return cached;

    const loginId = this.#resolveCharacterLogin(characterId);
    if (!loginId) return null;

    const record = this.#readJson<Character>(this.#characterKey(loginId, characterId));
    if (record) {
      this.#characters.set(characterId, record);
      this.#characterLoginIndex.set(characterId, loginId);
    }
    return record;
  }

  listCharactersByLogin(loginId: string): Character[] {
    const keys = this.#listKeys(`${this.#prefix}characters/${loginId}/`);
    return keys
      .map((key) => this.#readJson<Character>(key))
      .filter((character): character is Character => Boolean(character));
  }

  upsertSession(session: SessionRecord): SessionRecord {
    this.#sessions.set(session.id, session);
    this.#sessionLoginIndex.set(session.id, session.loginId);
    this.#writeJson(this.#sessionKey(session.loginId, session.id), session);
    this.#writeJson(this.#sessionIndexKey(session.id), { loginId: session.loginId });
    return session;
  }

  getSession(sessionId: string): SessionRecord | null {
    const cached = this.#sessions.get(sessionId);
    if (cached) return cached;

    const loginId = this.#resolveSessionLogin(sessionId);
    if (!loginId) return null;

    const record = this.#readJson<SessionRecord>(this.#sessionKey(loginId, sessionId));
    if (record) {
      this.#sessions.set(sessionId, record);
      this.#sessionLoginIndex.set(sessionId, loginId);
    }
    return record;
  }

  listSessionsByLogin(loginId: string): SessionRecord[] {
    const keys = this.#listKeys(`${this.#prefix}sessions/${loginId}/`, true);
    return keys
      .map((key) => this.#readJson<SessionRecord>(key))
      .filter((session): session is SessionRecord => Boolean(session));
  }

  addTurn(turn: Turn): Turn {
    const session = this.getSession(turn.sessionId);
    if (!session) {
      throw new Error(`Session ${turn.sessionId} not found for turn ${turn.id}`);
    }
    const key = this.#turnKey(session.loginId, session.id, turn.id);
    this.#writeJson(key, turn);
    return turn;
  }

  listTurns(sessionId: string): Turn[] {
    const session = this.getSession(sessionId);
    if (!session) {
      return [];
    }
    const keys = this.#listKeys(this.#turnPrefix(session.loginId, session.id));
    const turns = keys
      .map((key) => this.#readJson<Turn>(key))
      .filter((turn): turn is Turn => Boolean(turn));
    return turns.sort((a, b) => (a.turnSequence ?? 0) - (b.turnSequence ?? 0));
  }

  #resolveSessionLogin(sessionId: string): string | null {
    if (this.#sessionLoginIndex.has(sessionId)) {
      return this.#sessionLoginIndex.get(sessionId)!;
    }
    const pointer = this.#readJson<{ loginId: string }>(this.#sessionIndexKey(sessionId));
    if (pointer?.loginId) {
      this.#sessionLoginIndex.set(sessionId, pointer.loginId);
      return pointer.loginId;
    }
    return null;
  }

  #resolveCharacterLogin(characterId: string): string | null {
    if (this.#characterLoginIndex.has(characterId)) {
      return this.#characterLoginIndex.get(characterId)!;
    }
    const pointer = this.#readJson<{ loginId: string }>(this.#characterIndexKey(characterId));
    if (pointer?.loginId) {
      this.#characterLoginIndex.set(characterId, pointer.loginId);
      return pointer.loginId;
    }
    return null;
  }

  #listKeys(prefix: string, shallow = false): string[] {
    const results: string[] = [];
    let continuationToken: string | undefined;
    do {
      const response = blockOn(
        this.#client.send(
          new ListObjectsV2Command({
            Bucket: this.#bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
            Delimiter: shallow ? "/" : undefined
          })
        ),
        this.#timeout
      );
      for (const entry of response.Contents ?? []) {
        if (!entry.Key) continue;
        if (!entry.Key.endsWith(".json")) continue;
        results.push(entry.Key);
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
    return results;
  }

  #readJson<T>(key: string): T | null {
    try {
      const output = blockOn(
        this.#client.send(
          new GetObjectCommand({
            Bucket: this.#bucket,
            Key: key
          })
        ),
        this.#timeout
      );
      const body =
        output.Body && "transformToString" in output.Body
          ? blockOn(output.Body.transformToString(), this.#timeout)
          : null;
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
    blockOn(
      this.#client.send(
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: key,
          Body: JSON.stringify(payload, null, 2),
          ContentType: "application/json"
        })
      ),
      this.#timeout
    );
  }

  #loginKey(loginId: string): string {
    return `${this.#prefix}logins/${loginId}.json`;
  }

  #locationKey(locationId: string): string {
    return `${this.#prefix}locations/${locationId}.json`;
  }

  #characterKey(loginId: string, characterId: string): string {
    return `${this.#prefix}characters/${loginId}/${characterId}.json`;
  }

  #characterIndexKey(characterId: string): string {
    return `${this.#prefix}characters/index/${characterId}.json`;
  }

  #sessionKey(loginId: string, sessionId: string): string {
    return `${this.#prefix}sessions/${loginId}/${sessionId}.json`;
  }

  #sessionIndexKey(sessionId: string): string {
    return `${this.#prefix}sessions/index/${sessionId}.json`;
  }

  #turnPrefix(loginId: string, sessionId: string): string {
    return `${this.#prefix}sessions/${loginId}/${sessionId}/turns/`;
  }

  #turnKey(loginId: string, sessionId: string, turnId: string): string {
    return `${this.#turnPrefix(loginId, sessionId)}${turnId}.json`;
  }
}
