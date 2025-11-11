import { S3Client, GetObjectCommand, PutObjectCommand, paginateListObjectsV2 } from "@aws-sdk/client-s3";
import { fromEnv } from "@aws-sdk/credential-providers";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type {
  Character,
  Chronicle,
  LocationProfile,
  Login,
  Turn
} from "@glass-frontier/dto";
import { log } from "@glass-frontier/utils";
import type { WorldStateStore } from "./worldStateStore";
import type { CharacterProgressPayload, ChronicleSnapshot } from "./types";
import { applyCharacterSnapshotProgress } from "./characterProgress";

const isNotFound = (error: unknown): boolean => {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404;
};

export class S3WorldStateStore implements WorldStateStore {
  #bucket: string;
  #prefix: string;
  #client: S3Client;

  #logins = new Map<string, Login>();
  #locations = new Map<string, LocationProfile>();
  #characters = new Map<string, Character>();
  #chronicles = new Map<string, Chronicle>();
  #chronicleLoginIndex = new Map<string, string>();
  #characterLoginIndex = new Map<string, string>();

  constructor(options: { bucket: string; prefix?: string | null; client?: S3Client; region?: string }) {
    if (!options.bucket) {
      throw new Error("S3WorldStateStore requires a bucket name.");
    }
    this.#bucket = options.bucket;
    this.#prefix = options.prefix ? options.prefix.replace(/\/+$/, "") + "/" : "";
    const credentials =
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? fromEnv() : undefined;
    this.#client =
      options.client ??
      new S3Client({
        region: options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
        credentials
      });
    log("info", `Using S3 world state store bucket=${this.#bucket} prefix=${this.#prefix || "<root>"}`);
  }

  async ensureChronicle(params: {
    chronicleId?: string;
    loginId: string;
    locationId: string;
    characterId?: string;
    title?: string;
    status?: Chronicle["status"];
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
          : "Untitled Chronicle",
      status: params.status ?? "open",
      metadata: undefined
    };
    return this.upsertChronicle(record);
  }

  async getChronicleState(chronicleId: string): Promise<ChronicleSnapshot | null> {
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
    await this.#writeJson(this.#loginKey(login.id), login);
    return login;
  }

  async getLogin(loginId: string): Promise<Login | null> {
    const cached = this.#logins.get(loginId);
    if (cached) return cached;
    const record = await this.#readJson<Login>(this.#loginKey(loginId));
    if (record) {
      this.#logins.set(loginId, record);
    }
    return record;
  }

  async listLogins(): Promise<Login[]> {
    const keys = await this.#listKeys(`${this.#prefix}logins/`);
    const records = await Promise.all(keys.map((key) => this.#readJson<Login>(key)));
    return records.filter((login): login is Login => Boolean(login));
  }

  async upsertLocation(location: LocationProfile): Promise<LocationProfile> {
    this.#locations.set(location.id, location);
    await this.#writeJson(this.#locationKey(location.id), location);
    return location;
  }

  async getLocation(locationId: string): Promise<LocationProfile | null> {
    const cached = this.#locations.get(locationId);
    if (cached) return cached;
    const record = await this.#readJson<LocationProfile>(this.#locationKey(locationId));
    if (record) {
      this.#locations.set(locationId, record);
    }
    return record;
  }

  async listLocations(): Promise<LocationProfile[]> {
    const keys = await this.#listKeys(`${this.#prefix}locations/`);
    const records = await Promise.all(keys.map((key) => this.#readJson<LocationProfile>(key)));
    return records.filter((loc): loc is LocationProfile => Boolean(loc));
  }

  async upsertCharacter(character: Character): Promise<Character> {
    this.#characters.set(character.id, character);
    this.#characterLoginIndex.set(character.id, character.loginId);
    await Promise.all([
      this.#writeJson(this.#characterKey(character.loginId, character.id), character),
      this.#writeJson(this.#characterIndexKey(character.id), { loginId: character.loginId })
    ]);
    return character;
  }

  async getCharacter(characterId: string): Promise<Character | null> {
    const cached = this.#characters.get(characterId);
    if (cached) return cached;

    const loginId = await this.#resolveCharacterLogin(characterId);
    if (!loginId) return null;

    const record = await this.#readJson<Character>(this.#characterKey(loginId, characterId));
    if (record) {
      this.#characters.set(characterId, record);
      this.#characterLoginIndex.set(characterId, loginId);
    }
    return record;
  }

  async listCharactersByLogin(loginId: string): Promise<Character[]> {
    const keys = await this.#listKeys(`${this.#prefix}characters/${loginId}/`);
    const records = await Promise.all(keys.map((key) => this.#readJson<Character>(key)));
    return records.filter((character): character is Character => Boolean(character));
  }

  async upsertChronicle(chronicle: Chronicle): Promise<Chronicle> {
    this.#chronicles.set(chronicle.id, chronicle);
    this.#chronicleLoginIndex.set(chronicle.id, chronicle.loginId);
    await Promise.all([
      this.#writeJson(this.#chronicleKey(chronicle.loginId, chronicle.id), chronicle),
      this.#writeJson(this.#chronicleIndexKey(chronicle.id), { loginId: chronicle.loginId })
    ]);
    return chronicle;
  }

  async getChronicle(chronicleId: string): Promise<Chronicle | null> {
    const cached = this.#chronicles.get(chronicleId);
    if (cached) return cached;

    const loginId = await this.#resolveChronicleLogin(chronicleId);
    if (!loginId) return null;

    const record = await this.#readJson<Chronicle>(this.#chronicleKey(loginId, chronicleId));
    if (record) {
      this.#chronicles.set(chronicleId, record);
      this.#chronicleLoginIndex.set(chronicleId, loginId);
    }
    return record;
  }

  async listChroniclesByLogin(loginId: string): Promise<Chronicle[]> {
    const keys = await this.#listKeys(`${this.#prefix}chronicles/${loginId}/`, true);
    const records = await Promise.all(keys.map((key) => this.#readJson<Chronicle>(key)));
    return records.filter((chronicle): chronicle is Chronicle => Boolean(chronicle));
  }

  async addTurn(turn: Turn): Promise<Turn> {
    const chronicleId = turn.chronicleId;
    const chronicle = chronicleId ? await this.getChronicle(chronicleId) : null;
    if (!chronicle || !chronicleId) {
      throw new Error(`Chronicle ${chronicleId ?? "<unknown>"} not found for turn ${turn.id}`);
    }
    const key = this.#turnKey(chronicle.loginId, chronicle.id, turn.id);
    await this.#writeJson(key, turn);
    return turn;
  }

  async listChronicleTurns(chronicleId: string): Promise<Turn[]> {
    const chronicle = await this.getChronicle(chronicleId);
    if (!chronicle) {
      return [];
    }
    const keys = await this.#listKeys(this.#turnPrefix(chronicle.loginId, chronicle.id));
    const turns = await Promise.all(keys.map((key) => this.#readJson<Turn>(key)));
    return turns
      .filter((turn): turn is Turn => Boolean(turn))
      .sort((a, b) => (a.turnSequence ?? 0) - (b.turnSequence ?? 0));
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
    const pointer = await this.#readJson<{ loginId: string }>(this.#chronicleIndexKey(chronicleId));
    if (pointer?.loginId) {
      this.#chronicleLoginIndex.set(chronicleId, pointer.loginId);
      return pointer.loginId;
    }
    return null;
  }

  async #resolveCharacterLogin(characterId: string): Promise<string | null> {
    if (this.#characterLoginIndex.has(characterId)) {
      return this.#characterLoginIndex.get(characterId)!;
    }
    const pointer = await this.#readJson<{ loginId: string }>(this.#characterIndexKey(characterId));
    if (pointer?.loginId) {
      this.#characterLoginIndex.set(characterId, pointer.loginId);
      return pointer.loginId;
    }
    return null;
  }

  async #listKeys(prefix: string, shallow = false): Promise<string[]> {
    const results: string[] = [];
    const paginator = paginateListObjectsV2(
      { client: this.#client },
      {
        Bucket: this.#bucket,
        Prefix: prefix,
        Delimiter: shallow ? "/" : undefined
      }
    );

    for await (const page of paginator) {
      for (const obj of page.Contents ?? []) {
        if (obj.Key?.endsWith(".json")) results.push(obj.Key);
      }
    }
    return results;
  }

  async #readJson<T>(key: string): Promise<T | null> {
    try {
      const output = await this.#client.send(
        new GetObjectCommand({
          Bucket: this.#bucket,
          Key: key
        })
      );
      const text = await this.#readBody(output.Body);
      if (!text) {
        return null;
      }
      return JSON.parse(text) as T;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async #readBody(body: unknown): Promise<string | null> {
    if (!body) {
      return null;
    }
    if (typeof body === "string") {
      return body;
    }
    if (Buffer.isBuffer(body)) {
      return body.toString("utf-8");
    }
    if (typeof (body as any).transformToString === "function") {
      return (body as any).transformToString("utf-8");
    }
    if (typeof (body as any).arrayBuffer === "function") {
      const arrayBuffer = await (body as any).arrayBuffer();
      return Buffer.from(arrayBuffer).toString("utf-8");
    }
    if (body instanceof Readable) {
      return new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        body.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        body.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        body.on("error", reject);
      });
    }
    return null;
  }

  async #writeJson(key: string, payload: unknown): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        Body: JSON.stringify(payload, null, 2),
        ContentType: "application/json"
      })
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

  #chronicleKey(loginId: string, chronicleId: string): string {
    return `${this.#prefix}chronicles/${loginId}/${chronicleId}.json`;
  }

  #chronicleIndexKey(chronicleId: string): string {
    return `${this.#prefix}chronicles/index/${chronicleId}.json`;
  }

  #turnPrefix(loginId: string, chronicleId: string): string {
    return `${this.#prefix}chronicles/${loginId}/${chronicleId}/turns/`;
  }

  #turnKey(loginId: string, chronicleId: string, turnId: string): string {
    return `${this.#turnPrefix(loginId, chronicleId)}${turnId}.json`;
  }
}
