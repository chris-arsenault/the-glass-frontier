import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';

import {
  CharacterDraftSchema,
  CharacterSchema,
  CharacterSummarySchema,
  CharacterSummary,
  Character,
  InventorySchema,
  Chronicle,
  ChronicleDraftSchema,
  ChronicleSchema,
  ChronicleSummary,
  ChronicleSummarySchema,
  ChronicleSummaryEntry,
  ChronicleSummaryEntrySchema,
  Location,
  LocationDraftSchema,
  LocationEvent,
  LocationEventSchema,
  LocationGraphChunk,
  LocationGraphChunkSchema,
  LocationGraphManifest,
  LocationGraphManifestSchema,
  LocationGraphSnapshot,
  LocationGraphSnapshotSchema,
  LocationPlace,
  LocationNeighborSummary,
  LocationNeighborSummarySchema,
  LocationSchema,
  LocationState,
  LocationStateSchema,
  LocationSummary,
  LocationSummarySchema,
  Login,
  LoginSchema,
  PageOptions,
  Turn,
  TurnChunk,
  TurnChunkManifest,
  TurnChunkManifestSchema,
  TurnChunkSchema,
  TurnSchema,
  TurnSummary,
  TurnSummarySchema,
} from '../dto';
import type { CharacterDraft, ChronicleDraft, LocationDraft } from '../dto';
import type { ChronicleSnapshotV2 } from './snapshots';
import type {
  CharacterConnection,
  ChronicleConnection,
  ChronicleTurnConnection,
  LocationConnection,
  LocationGraphChunkConnection,
  LocationNeighborConnection,
  WorldStateStoreV2,
} from './types';
import { Cursor } from './cursor';
import { WorldStateKeyFactory } from './keys';

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_TURN_CHUNK_SIZE = 50;
const DEFAULT_CHUNK_PAGE_SIZE = 1;

const PK = {
  tenant: (loginId: string) => `TENANT#${loginId}`,
  character: (characterId: string) => `CHARACTER#${characterId}`,
  chronicle: (chronicleId: string) => `CHRONICLE#${chronicleId}`,
  location: (locationId: string) => `LOCATION#${locationId}`,
  place: (placeId: string) => `PLACE#${placeId}`,
};

const SK = {
  login: 'LOGIN',
  character: (characterId: string) => `CHARACTER#${characterId}`,
  chronicle: (chronicleId: string) => `CHRONICLE#${chronicleId}`,
  location: (locationId: string) => `LOCATION#${locationId}`,
  meta: 'META',
  turnChunk: (chunkIndex: number) => `TURN_CHUNK#${chunkIndex.toString().padStart(6, '0')}`,
  graphChunk: (chunkIndex: number) => `GRAPH_CHUNK#${chunkIndex.toString().padStart(6, '0')}`,
  locationState: (locationId: string) => `LOCATION_STATE#${locationId}`,
  neighbor: (relation: string, neighborPlaceId: string) => `NEIGHBOR#${relation}#${neighborPlaceId}`,
};

const DEFAULT_INDEXES = {
  characterById: 'GSI1',
  chronicleById: 'GSI2',
  chronicleByCharacter: 'GSI3',
  neighborByPlace: 'GSI4',
};

const nowIso = (): string => new Date().toISOString();

const toBuffer = async (body: GetObjectCommandOutput['Body']): Promise<Buffer> => {
  if (!body) return Buffer.alloc(0);
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  if ('transformToByteArray' in body) {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks: Buffer[] = [];
  const stream = body as Readable;
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const readJson = async <T>(client: S3Client, bucket: string, key: string): Promise<T | null> => {
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    const buf = await toBuffer(res.Body);
    if (buf.byteLength === 0) return null;
    return JSON.parse(buf.toString('utf8')) as T;
  } catch (error) {
    if ((error as Error).name === 'NoSuchKey') return null;
    throw error;
  }
};

const writeJson = async (client: S3Client, bucket: string, key: string, payload: unknown): Promise<void> => {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(JSON.stringify(payload)),
      ContentType: 'application/json',
    })
  );
};

export type WorldStateStoreOptions = {
  tableName: string;
  bucketName: string;
  s3Prefix?: string;
  defaultPageSize?: number;
  turnChunkSize?: number;
  dynamoClient: DynamoDBClient;
  documentClient?: DynamoDBDocumentClient;
  s3Client: S3Client;
  indexes?: Partial<typeof DEFAULT_INDEXES>;
};

type CharacterRow = {
  PK: string;
  SK: string;
  entityType: 'CHARACTER';
  characterId: string;
  loginId: string;
  name: string;
  archetype: string;
  portraitUrl?: string;
  lastTurnAt?: string | null;
  status: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  documentKey: string;
  GSI1PK: string;
  GSI1SK: string;
};

type ChronicleRow = {
  PK: string;
  SK: string;
  entityType: 'CHRONICLE';
  chronicleId: string;
  loginId: string;
  characterId: string;
  title: string;
  status: string;
  lastTurnPreview?: TurnSummary;
  turnChunkCount: number;
  heroArtUrl?: string;
  manifestKey: string;
  documentKey: string;
  createdAt: string;
  updatedAt: string;
  GSI2PK: string;
  GSI2SK: string;
  GSI3PK: string;
  GSI3SK: string;
};

type ChronicleMetaRow = {
  PK: string;
  SK: string;
  entityType: 'CHRONICLE_META';
  chronicleId: string;
  loginId: string;
  characterId: string;
  locationId?: string | null;
  documentKey: string;
  manifestKey: string;
};

type LocationRow = {
  PK: string;
  SK: string;
  entityType: 'LOCATION';
  locationId: string;
  loginId: string;
  chronicleId: string;
  name: string;
  anchorPlaceId: string;
  breadcrumb: LocationSummary['breadcrumb'];
  description?: string;
  status?: string[];
  tags?: string[];
  nodeCount: number;
  edgeCount: number;
  graphChunkCount: number;
  documentKey: string;
  manifestKey: string;
  createdAt: string;
  updatedAt: string;
};

type ChronicleTurnChunkRow = {
  PK: string;
  SK: string;
  entityType: 'TURN_CHUNK';
  chronicleId: string;
  chunkIndex: number;
  startSequence: number;
  endSequence: number;
  chunkKey: string;
  turnCount: number;
  updatedAt: string;
};

type LocationGraphChunkRow = {
  PK: string;
  SK: string;
  entityType: 'LOCATION_GRAPH_CHUNK';
  locationId: string;
  chunkIndex: number;
  nodeStart: number;
  nodeCount: number;
  edgeCount: number;
  chunkKey: string;
  updatedAt: string;
};

type LocationNeighborRow = {
  PK: string;
  SK: string;
  entityType: 'LOCATION_NEIGHBOR';
  locationId: string;
  placeId: string;
  neighborPlaceId: string;
  relationKind: string;
  depth: number;
  name: string;
  breadcrumb: LocationSummary['breadcrumb'];
  tags?: string[];
};

const turnPreviewFromTurn = (turn: Turn): TurnSummary =>
  TurnSummarySchema.parse({
    turnId: turn.id,
    turnSequence: turn.turnSequence,
    summary: turn.gmSummary ?? turn.gmMessage ?? turn.playerMessage ?? 'Turn',
    createdAt: turn.createdAt,
  });

export class DynamoWorldStateStore implements WorldStateStoreV2 {
  readonly #tableName: string;
  readonly #bucketName: string;
  readonly #docClient: DynamoDBDocumentClient;
  readonly #s3: S3Client;
  readonly #keys: WorldStateKeyFactory;
  readonly #pageSize: number;
  readonly #turnChunkSize: number;
  readonly #indexes: typeof DEFAULT_INDEXES;

  constructor(options: WorldStateStoreOptions) {
    this.#tableName = options.tableName;
    this.#bucketName = options.bucketName;
    this.#docClient =
      options.documentClient ??
      DynamoDBDocumentClient.from(options.dynamoClient, {
        marshallOptions: { removeUndefinedValues: true },
      });
    this.#s3 = options.s3Client;
    this.#keys = new WorldStateKeyFactory(options.s3Prefix);
    this.#pageSize = options.defaultPageSize ?? DEFAULT_PAGE_SIZE;
    this.#turnChunkSize = options.turnChunkSize ?? DEFAULT_TURN_CHUNK_SIZE;
    this.#indexes = { ...DEFAULT_INDEXES, ...options.indexes };
  }

  async upsertLogin(login: Login): Promise<Login> {
    const record = LoginSchema.parse(login);
    const key = this.#keys.login(record.id);
    const timestamp = nowIso();
    await writeJson(this.#s3, this.#bucketName, key, record);
    await this.#docClient.send(
      new PutCommand({
        TableName: this.#tableName,
        Item: {
          PK: PK.tenant(record.id),
          SK: SK.login,
          entityType: 'LOGIN',
          loginId: record.id,
          loginName: record.loginName,
          summaryKey: key,
          createdAt: record.createdAt,
          updatedAt: timestamp,
        },
      })
    );
    return record;
  }

  async getLogin(loginId: string): Promise<Login | null> {
    const res = await this.#docClient.send(
      new GetCommand({
        TableName: this.#tableName,
        Key: { PK: PK.tenant(loginId), SK: SK.login },
      })
    );
    if (!res.Item) return null;
    const key = res.Item.summaryKey as string;
    return readJson<Login>(this.#s3, this.#bucketName, key);
  }

  async createCharacter(input: CharacterDraft): Promise<Character> {
    const draft = CharacterDraftSchema.parse(input);
    const id = draft.id ?? randomUUID();
    const now = nowIso();
    const inventory = InventorySchema.parse(draft.inventory ?? {});
    const character = CharacterSchema.parse({
      id,
      loginId: draft.loginId,
      defaultChronicleId: draft.defaultChronicleId,
      name: draft.name,
      pronouns: draft.pronouns,
      archetype: draft.archetype,
      bio: draft.bio,
      portraitUrl: draft.portraitUrl,
      tags: draft.tags,
      metadata: draft.metadata,
      attributes: draft.attributes,
      skills: draft.skills,
      momentum: draft.momentum,
      inventory,
      locationState: draft.locationState,
      createdAt: now,
      updatedAt: now,
    });
    const summary = CharacterSummarySchema.parse({
      id: character.id,
      loginId: character.loginId,
      name: character.name,
      archetype: character.archetype,
      portraitUrl: character.portraitUrl,
      status: character.status,
      tags: character.tags,
      lastTurnAt: character.lastTurnAt ?? null,
    });
    const documentKey = this.#keys.characterDocument(id);
    await writeJson(this.#s3, this.#bucketName, documentKey, character);
    const item: CharacterRow = {
      PK: PK.tenant(summary.loginId),
      SK: SK.character(id),
      entityType: 'CHARACTER',
      characterId: id,
      loginId: summary.loginId,
      name: summary.name,
      archetype: summary.archetype,
      portraitUrl: summary.portraitUrl,
      lastTurnAt: summary.lastTurnAt ?? null,
      status: summary.status,
      tags: summary.tags,
      createdAt: character.createdAt,
      updatedAt: character.updatedAt,
      documentKey,
      GSI1PK: PK.character(id),
      GSI1SK: PK.tenant(summary.loginId),
    };
    await this.#docClient.send(
      new PutCommand({
        TableName: this.#tableName,
        Item: item,
      })
    );
    return character;
  }

  async updateCharacter(character: Character): Promise<Character> {
    const row = await this.#getCharacterRow(character.id);
    if (!row) {
      throw new Error(`Character ${character.id} not found`);
    }
    const updated = CharacterSchema.parse({ ...character, updatedAt: nowIso() });
    await writeJson(this.#s3, this.#bucketName, row.documentKey, updated);
    const summary = CharacterSummarySchema.parse({
      id: updated.id,
      loginId: updated.loginId,
      name: updated.name,
      archetype: updated.archetype,
      portraitUrl: updated.portraitUrl,
      status: updated.status,
      tags: updated.tags,
      lastTurnAt: updated.lastTurnAt ?? null,
    });
    const item: CharacterRow = {
      PK: PK.tenant(summary.loginId),
      SK: SK.character(updated.id),
      entityType: 'CHARACTER',
      characterId: updated.id,
      loginId: summary.loginId,
      name: summary.name,
      archetype: summary.archetype,
      portraitUrl: summary.portraitUrl,
      lastTurnAt: summary.lastTurnAt ?? null,
      status: summary.status,
      tags: summary.tags,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      documentKey: row.documentKey,
      GSI1PK: PK.character(updated.id),
      GSI1SK: PK.tenant(summary.loginId),
    };
    await this.#docClient.send(
      new PutCommand({
        TableName: this.#tableName,
        Item: item,
      })
    );
    return updated;
  }

  async getCharacter(characterId: string): Promise<Character | null> {
    const res = await this.#docClient.send(
      new QueryCommand({
        TableName: this.#tableName,
        IndexName: this.#indexes.characterById,
        KeyConditionExpression: '#gsi = :pk',
        ExpressionAttributeNames: { '#gsi': 'GSI1PK' },
        ExpressionAttributeValues: { ':pk': PK.character(characterId) },
        Limit: 1,
      })
    );
    const item = (res.Items?.[0] as CharacterRow | undefined) ?? null;
    if (!item) return null;
    const doc = await readJson<Character>(this.#s3, this.#bucketName, item.documentKey);
    return doc ?? null;
  }

  async listCharacters(loginId: string, page?: PageOptions): Promise<CharacterConnection> {
    const limit = page?.limit ?? this.#pageSize;
    const cursorKey = Cursor.decode(page?.cursor);
    const res = await this.#docClient.send(
      new QueryCommand({
        TableName: this.#tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: { ':pk': PK.tenant(loginId), ':sk': 'CHARACTER#' },
        Limit: limit,
        ExclusiveStartKey: cursorKey,
      })
    );
    const summaries: CharacterSummary[] = (res.Items ?? []).map((item) =>
      CharacterSummarySchema.parse({
        id: (item as CharacterRow).characterId,
        loginId: (item as CharacterRow).loginId,
        name: (item as CharacterRow).name,
        archetype: (item as CharacterRow).archetype,
        portraitUrl: (item as CharacterRow).portraitUrl,
        lastTurnAt: (item as CharacterRow).lastTurnAt,
        status: (item as CharacterRow).status,
        tags: (item as CharacterRow).tags ?? [],
      })
    );
    return {
      items: summaries,
      nextCursor: Cursor.encode(res.LastEvaluatedKey as Record<string, unknown>),
    };
  }

  async createChronicle(input: ChronicleDraft): Promise<Chronicle> {
    const draft = ChronicleDraftSchema.parse(input);
    const id = draft.id ?? randomUUID();
    const now = nowIso();
    const summary = ChronicleSummarySchema.parse({ ...draft, id });
    const chronicle = ChronicleSchema.parse({
      ...summary,
      createdAt: now,
      updatedAt: now,
      locationId: draft.locationId,
      description: draft.description,
      metadata: draft.metadata,
    });
    const documentKey = this.#keys.chronicleMeta(id);
    const manifestKey = this.#keys.chronicleManifest(id);
    await writeJson(this.#s3, this.#bucketName, documentKey, chronicle);
    await writeJson(this.#s3, this.#bucketName, manifestKey, this.#emptyTurnManifest(id));
    const item: ChronicleRow = {
      PK: PK.tenant(summary.loginId),
      SK: SK.chronicle(id),
      entityType: 'CHRONICLE',
      chronicleId: id,
      loginId: summary.loginId,
      characterId: summary.characterId,
      title: summary.title,
      status: summary.status,
      lastTurnPreview: summary.lastTurnPreview,
      turnChunkCount: summary.turnChunkCount ?? 0,
      heroArtUrl: summary.heroArtUrl,
      manifestKey,
      documentKey,
      createdAt: chronicle.createdAt,
      updatedAt: chronicle.updatedAt,
      GSI2PK: PK.chronicle(id),
      GSI2SK: PK.tenant(summary.loginId),
      GSI3PK: PK.character(summary.characterId),
      GSI3SK: PK.tenant(summary.loginId),
    };
    await this.#docClient.send(
      new PutCommand({ TableName: this.#tableName, Item: item })
    );
    await this.#docClient.send(
      new PutCommand({
        TableName: this.#tableName,
        Item: {
          PK: PK.chronicle(id),
          SK: SK.meta,
          entityType: 'CHRONICLE_META',
          chronicleId: id,
          loginId: summary.loginId,
          characterId: summary.characterId,
          locationId: draft.locationId ?? null,
          manifestKey,
          documentKey,
        },
      })
    );
    return chronicle;
  }

  async updateChronicle(chronicle: Chronicle): Promise<Chronicle> {
    const meta = await this.#getChronicleMeta(chronicle.id);
    if (!meta) {
      throw new Error(`Chronicle ${chronicle.id} not found`);
    }
    const updated = ChronicleSchema.parse({ ...chronicle, updatedAt: nowIso() });
    await writeJson(this.#s3, this.#bucketName, meta.documentKey, updated);
    const summary = ChronicleSummarySchema.parse({
      id: updated.id,
      loginId: updated.loginId,
      characterId: updated.characterId,
      title: updated.title,
      status: updated.status,
      lastTurnPreview: updated.lastTurnPreview,
      turnChunkCount: updated.turnChunkCount,
      heroArtUrl: updated.heroArtUrl,
    });
    const item: ChronicleRow = {
      PK: PK.tenant(summary.loginId),
      SK: SK.chronicle(updated.id),
      entityType: 'CHRONICLE',
      chronicleId: updated.id,
      loginId: summary.loginId,
      characterId: summary.characterId,
      title: summary.title,
      status: summary.status,
      lastTurnPreview: summary.lastTurnPreview,
      turnChunkCount: summary.turnChunkCount ?? 0,
      heroArtUrl: summary.heroArtUrl,
      manifestKey: meta.manifestKey,
      documentKey: meta.documentKey,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      GSI2PK: PK.chronicle(updated.id),
      GSI2SK: PK.tenant(summary.loginId),
      GSI3PK: PK.character(summary.characterId),
      GSI3SK: PK.tenant(summary.loginId),
    };
    await this.#docClient.send(new PutCommand({ TableName: this.#tableName, Item: item }));
    await this.#docClient.send(
      new PutCommand({
        TableName: this.#tableName,
        Item: {
          PK: PK.chronicle(updated.id),
          SK: SK.meta,
          entityType: 'CHRONICLE_META',
          chronicleId: updated.id,
          loginId: summary.loginId,
          characterId: summary.characterId,
          locationId: updated.locationId ?? null,
          manifestKey: meta.manifestKey,
          documentKey: meta.documentKey,
        },
      })
    );
    return updated;
  }

  async deleteChronicle(chronicleId: string): Promise<void> {
    const meta = await this.#getChronicleMeta(chronicleId);
    if (!meta) {
      return;
    }
    await this.#docClient.send(
      new DeleteCommand({
        TableName: this.#tableName,
        Key: { PK: PK.tenant(meta.loginId), SK: SK.chronicle(chronicleId) },
      })
    );
    await this.#docClient.send(
      new DeleteCommand({
        TableName: this.#tableName,
        Key: { PK: PK.chronicle(chronicleId), SK: SK.meta },
      })
    );
    await this.#deleteTurnChunks(chronicleId, meta.manifestKey);
    await this.#s3.send(
      new DeleteObjectCommand({
        Bucket: this.#bucketName,
        Key: meta.documentKey,
      })
    );
    await this.#s3.send(
      new DeleteObjectCommand({
        Bucket: this.#bucketName,
        Key: meta.manifestKey,
      })
    );
  }

  async appendChronicleSummary(
    chronicleId: string,
    entry: ChronicleSummaryEntry
  ): Promise<Chronicle | null> {
    const parsedEntry = ChronicleSummaryEntrySchema.parse(entry);
    const meta = await this.#getChronicleMeta(chronicleId);
    if (!meta) return null;
    const chronicle = await readJson<Chronicle>(this.#s3, this.#bucketName, meta.documentKey);
    if (!chronicle) return null;
    const updated: Chronicle = ChronicleSchema.parse({
      ...chronicle,
      summaries: [...(chronicle.summaries ?? []), parsedEntry],
      updatedAt: nowIso(),
    });
    await writeJson(this.#s3, this.#bucketName, meta.documentKey, updated);
    await this.#docClient.send(
      new UpdateCommand({
        TableName: this.#tableName,
        Key: { PK: PK.tenant(meta.loginId), SK: SK.chronicle(chronicleId) },
        UpdateExpression: 'SET updatedAt = :updated',
        ExpressionAttributeValues: { ':updated': updated.updatedAt },
      })
    );
    return updated;
  }

  async getChronicle(chronicleId: string): Promise<Chronicle | null> {
    const res = await this.#docClient.send(
      new GetCommand({
        TableName: this.#tableName,
        Key: { PK: PK.chronicle(chronicleId), SK: SK.meta },
      })
    );
    if (!res.Item) return null;
    return readJson<Chronicle>(this.#s3, this.#bucketName, res.Item.documentKey as string);
  }

  async listChronicles(loginId: string, page?: PageOptions): Promise<ChronicleConnection> {
    const limit = page?.limit ?? this.#pageSize;
    const cursorKey = Cursor.decode(page?.cursor);
    const res = await this.#docClient.send(
      new QueryCommand({
        TableName: this.#tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: { ':pk': PK.tenant(loginId), ':sk': 'CHRONICLE#' },
        Limit: limit,
        ExclusiveStartKey: cursorKey,
      })
    );
    const items: ChronicleSummary[] = (res.Items ?? []).map((item) =>
      ChronicleSummarySchema.parse({
        id: (item as ChronicleRow).chronicleId,
        loginId: (item as ChronicleRow).loginId,
        characterId: (item as ChronicleRow).characterId,
        title: (item as ChronicleRow).title,
        status: (item as ChronicleRow).status,
        lastTurnPreview: (item as ChronicleRow).lastTurnPreview,
        turnChunkCount: (item as ChronicleRow).turnChunkCount,
        heroArtUrl: (item as ChronicleRow).heroArtUrl,
      })
    );
    return {
      items,
      nextCursor: Cursor.encode(res.LastEvaluatedKey as Record<string, unknown>),
    };
  }

  async getChronicleSnapshot(chronicleId: string): Promise<ChronicleSnapshotV2 | null> {
    const chronicle = await this.getChronicle(chronicleId);
    if (!chronicle) return null;
    const character = chronicle.characterId ? await this.getCharacter(chronicle.characterId) : null;
    const turns = await this.#loadAllChronicleTurns(chronicleId);
    return { chronicle, character, turns };
  }

  async appendTurn(chronicleId: string, turn: Turn): Promise<Turn> {
    const parsed = TurnSchema.parse(turn);
    if (parsed.chronicleId !== chronicleId) {
      throw new Error('Chronicle mismatch');
    }
    const manifest = await this.#loadTurnManifest(chronicleId);
    const chunkEntry = this.#resolveTurnChunkEntry(manifest, parsed);
    const chunk = await this.#loadTurnChunk(chronicleId, chunkEntry);
    chunk.turns.push(parsed);
    chunk.endSequence = parsed.turnSequence;
    chunk.updatedAt = parsed.createdAt;
    chunkEntry.endSequence = parsed.turnSequence;
    chunkEntry.turnCount = chunk.turns.length;
    chunkEntry.updatedAt = parsed.createdAt;
    manifest.latestSequence = parsed.turnSequence;
    await writeJson(this.#s3, this.#bucketName, chunkEntry.chunkKey, TurnChunkSchema.parse(chunk));
    await this.#persistTurnManifest(chronicleId, manifest);
    await this.#upsertTurnChunkRow(chronicleId, chunkEntry);
    await this.#updateChroniclePreview(chronicleId, parsed, manifest.entries.length);
    return parsed;
  }

  async listChronicleTurns(
    chronicleId: string,
    page?: PageOptions & { chunkSize?: number }
  ): Promise<ChronicleTurnConnection> {
    const chunkLimit = page?.chunkSize ?? page?.limit ?? DEFAULT_CHUNK_PAGE_SIZE;
    const cursorKey = Cursor.decode(page?.cursor);
    const res = await this.#docClient.send(
      new QueryCommand({
        TableName: this.#tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: { ':pk': PK.chronicle(chronicleId), ':sk': 'TURN_CHUNK#' },
        Limit: chunkLimit,
        ExclusiveStartKey: cursorKey,
      })
    );
    const turns: Turn[] = [];
    for (const item of res.Items ?? []) {
      const pointer = item as ChronicleTurnChunkRow;
      const chunk = await readJson<TurnChunk>(this.#s3, this.#bucketName, pointer.chunkKey);
      if (chunk?.turns) {
        turns.push(...chunk.turns);
      }
    }
    return {
      items: turns,
      nextCursor: Cursor.encode(res.LastEvaluatedKey as Record<string, unknown>),
    };
  }

  async batchGetChronicleSummaries(ids: string[]): Promise<Map<string, ChronicleSummary>> {
    const metaKeys = ids.map((id) => ({ PK: PK.chronicle(id), SK: SK.meta }));
    const metaRows = await this.#batchGet<ChronicleMetaRow>(metaKeys);
    const summaryKeys = metaRows.map((meta) => ({
      PK: PK.tenant(meta.loginId),
      SK: SK.chronicle(meta.chronicleId),
    }));
    const result = new Map<string, ChronicleSummary>();
    if (summaryKeys.length === 0) return result;
    const summaryRows = await this.#batchGet<ChronicleRow>(summaryKeys);
    for (const item of summaryRows) {
      const summary = ChronicleSummarySchema.parse({
        id: item.chronicleId,
        loginId: item.loginId,
        characterId: item.characterId,
        title: item.title,
        status: item.status,
        lastTurnPreview: item.lastTurnPreview,
        turnChunkCount: item.turnChunkCount,
        heroArtUrl: item.heroArtUrl,
      });
      result.set(summary.id, summary);
    }
    return result;
  }

  async createLocation(input: LocationDraft): Promise<LocationSummary> {
    const draft = LocationDraftSchema.parse(input);
    const id = draft.id ?? randomUUID();
    const now = nowIso();
    const summary = LocationSummarySchema.parse({ ...draft, id });
    const location = LocationSchema.parse({ ...summary, metadata: draft.metadata, createdAt: now, updatedAt: now });
    const documentKey = this.#keys.locationMeta(id);
    const manifestKey = this.#keys.locationManifest(id);
    await writeJson(this.#s3, this.#bucketName, documentKey, location);
    await writeJson(
      this.#s3,
      this.#bucketName,
      manifestKey,
      this.#emptyGraphManifest(id)
    );
    if (draft.graph) {
      await this.#ingestGraphSnapshot(id, draft.graph);
    }
    const item: LocationRow = {
      PK: PK.tenant(summary.loginId),
      SK: SK.location(id),
      entityType: 'LOCATION',
      locationId: id,
      loginId: summary.loginId,
      chronicleId: summary.chronicleId,
      name: summary.name,
      anchorPlaceId: summary.anchorPlaceId,
      breadcrumb: summary.breadcrumb,
      description: summary.description,
      status: summary.status,
      tags: summary.tags,
      nodeCount: summary.nodeCount,
      edgeCount: summary.edgeCount,
      graphChunkCount: summary.graphChunkCount,
      documentKey,
      manifestKey,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
    };
    await this.#docClient.send(
      new PutCommand({ TableName: this.#tableName, Item: item })
    );
    await this.#docClient.send(
      new PutCommand({
        TableName: this.#tableName,
        Item: {
          PK: PK.location(id),
          SK: SK.meta,
          entityType: 'LOCATION_META',
          locationId: id,
          loginId: summary.loginId,
          chronicleId: summary.chronicleId,
          documentKey,
          manifestKey,
        },
      })
    );
    return summary;
  }

  async getLocation(locationId: string): Promise<Location | null> {
    const meta = await this.#getLocationMetadata(locationId);
    if (!meta) return null;
    return readJson<Location>(this.#s3, this.#bucketName, meta.documentKey);
  }

  async listLocations(loginId: string, page?: PageOptions): Promise<LocationConnection> {
    const limit = page?.limit ?? this.#pageSize;
    const cursorKey = Cursor.decode(page?.cursor);
    const res = await this.#docClient.send(
      new QueryCommand({
        TableName: this.#tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: { ':pk': PK.tenant(loginId), ':sk': 'LOCATION#' },
        Limit: limit,
        ExclusiveStartKey: cursorKey,
      })
    );
    const items: LocationSummary[] = (res.Items ?? []).map((item) =>
      LocationSummarySchema.parse({
        id: (item as LocationRow).locationId,
        loginId: (item as LocationRow).loginId,
        chronicleId: (item as LocationRow).chronicleId,
        name: (item as LocationRow).name,
        anchorPlaceId: (item as LocationRow).anchorPlaceId,
        breadcrumb: (item as LocationRow).breadcrumb,
        description: (item as LocationRow).description,
        status: (item as LocationRow).status ?? [],
        tags: (item as LocationRow).tags ?? [],
        nodeCount: (item as LocationRow).nodeCount,
        edgeCount: (item as LocationRow).edgeCount,
        graphChunkCount: (item as LocationRow).graphChunkCount,
      })
    );
    return {
      items,
      nextCursor: Cursor.encode(res.LastEvaluatedKey as Record<string, unknown>),
    };
  }

  async listLocationGraph(
    locationId: string,
    page?: PageOptions & { chunkSize?: number }
  ): Promise<LocationGraphChunkConnection> {
    const chunkLimit = page?.chunkSize ?? page?.limit ?? DEFAULT_CHUNK_PAGE_SIZE;
    const cursorKey = Cursor.decode(page?.cursor);
    const res = await this.#docClient.send(
      new QueryCommand({
        TableName: this.#tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: { ':pk': PK.location(locationId), ':sk': 'GRAPH_CHUNK#' },
        Limit: chunkLimit,
        ExclusiveStartKey: cursorKey,
      })
    );
    const chunks: LocationGraphChunk[] = [];
    for (const item of res.Items ?? []) {
      const pointer = item as LocationGraphChunkRow;
      const chunk = await readJson<LocationGraphChunk>(this.#s3, this.#bucketName, pointer.chunkKey);
      if (chunk) chunks.push(LocationGraphChunkSchema.parse(chunk));
    }
    return {
      items: chunks,
      nextCursor: Cursor.encode(res.LastEvaluatedKey as Record<string, unknown>),
    };
  }

  async updateLocationState(state: LocationState): Promise<LocationState> {
    const parsed = LocationStateSchema.parse(state);
    const key = this.#keys.locationState(parsed.locationId, parsed.characterId);
    await writeJson(this.#s3, this.#bucketName, key, parsed);
    await this.#docClient.send(
      new PutCommand({
        TableName: this.#tableName,
        Item: {
          PK: PK.character(parsed.characterId),
          SK: SK.locationState(parsed.locationId),
          entityType: 'LOCATION_STATE',
          locationId: parsed.locationId,
          characterId: parsed.characterId,
          stateKey: key,
          updatedAt: parsed.updatedAt,
        },
      })
    );
    return parsed;
  }

  async listLocationNeighbors(
    locationId: string,
    placeId: string,
    options?: { maxDepth?: number; relationKinds?: string[]; limit?: number; cursor?: string }
  ): Promise<LocationNeighborConnection> {
    const limit = options?.limit ?? this.#pageSize;
    const cursorKey = Cursor.decode(options?.cursor);
    const res = await this.#docClient.send(
      new QueryCommand({
        TableName: this.#tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK', '#loc': 'locationId' },
        ExpressionAttributeValues: {
          ':pk': PK.place(placeId),
          ':sk': 'NEIGHBOR#',
          ':loc': locationId,
        },
        FilterExpression: '#loc = :loc',
        Limit: limit,
        ExclusiveStartKey: cursorKey,
      })
    );
    const items: LocationNeighborSummary[] = [];
    for (const item of res.Items ?? []) {
      const neighbor = item as LocationNeighborRow;
      if (options?.relationKinds && !options.relationKinds.includes(neighbor.relationKind)) {
        continue;
      }
      if (options?.maxDepth !== undefined && neighbor.depth > options.maxDepth) {
        continue;
      }
      items.push(
        LocationNeighborSummarySchema.parse({
          locationId,
          placeId: neighbor.neighborPlaceId,
          relationKind: neighbor.relationKind,
          depth: neighbor.depth,
          name: neighbor.name,
          breadcrumb: neighbor.breadcrumb,
          tags: neighbor.tags ?? [],
        })
      );
    }
    return {
      items,
      nextCursor: Cursor.encode(res.LastEvaluatedKey as Record<string, unknown>),
    };
  }

  async listLocationEvents(locationId: string): Promise<LocationEvent[]> {
    const key = this.#keys.locationEvents(locationId);
    const events = await readJson<LocationEvent[]>(this.#s3, this.#bucketName, key);
    return Array.isArray(events) ? events.map((event) => LocationEventSchema.parse(event)) : [];
  }

  async appendLocationEvents(input: {
    locationId: string;
    events: Array<{
      chronicleId: string;
      summary: string;
      scope?: string;
      metadata?: Record<string, unknown>;
    }>;
  }): Promise<LocationEvent[]> {
    if (input.events.length === 0) return [];
    const key = this.#keys.locationEvents(input.locationId);
    const existing = (await readJson<LocationEvent[]>(this.#s3, this.#bucketName, key)) ?? [];
    const now = Date.now();
    const appended = input.events.map((event, index) =>
      LocationEventSchema.parse({
        id: randomUUID(),
        locationId: input.locationId,
        chronicleId: event.chronicleId,
        summary: event.summary,
        scope: event.scope,
        metadata: event.metadata,
        createdAt: new Date(now + index).toISOString(),
      })
    );
    await writeJson(this.#s3, this.#bucketName, key, [...existing, ...appended]);
    return appended;
  }

  async addLocationNeighborEdge(input: {
    locationId: string;
    src: LocationPlace;
    dst: LocationPlace;
    relationKind: string;
  }): Promise<void> {
    const placeMap = new Map([
      [input.src.id, input.src],
      [input.dst.id, input.dst],
    ]);
    const requests: Array<{ PutRequest: { Item: LocationNeighborRow } }> = [];
    const srcRow = this.#buildNeighborRow(input.locationId, input.src.id, input.dst.id, input.relationKind, placeMap);
    if (srcRow) requests.push({ PutRequest: { Item: srcRow } });
    const dstRow = this.#buildNeighborRow(input.locationId, input.dst.id, input.src.id, input.relationKind, placeMap);
    if (dstRow) requests.push({ PutRequest: { Item: dstRow } });
    await this.#batchWrite(requests);
  }

  async removeLocationNeighborEdge(input: {
    locationId: string;
    srcPlaceId: string;
    dstPlaceId: string;
    relationKind: string;
  }): Promise<void> {
    await this.#batchWrite([
      {
        DeleteRequest: {
          Key: { PK: PK.place(input.srcPlaceId), SK: SK.neighbor(input.relationKind, input.dstPlaceId) },
        },
      },
      {
        DeleteRequest: {
          Key: { PK: PK.place(input.dstPlaceId), SK: SK.neighbor(input.relationKind, input.srcPlaceId) },
        },
      },
    ]);
  }

  async #deleteTurnChunks(chronicleId: string, manifestKey: string): Promise<void> {
    const manifest = await readJson<TurnChunkManifest>(this.#s3, this.#bucketName, manifestKey);
    if (!manifest) {
      return;
    }
    const deletes =
      manifest.entries.map((entry) => ({
        DeleteRequest: {
          Key: { PK: PK.chronicle(chronicleId), SK: SK.turnChunk(entry.chunkIndex) },
        },
      })) ?? [];
    if (deletes.length > 0) {
      await this.#batchWrite(deletes);
    }
    for (const entry of manifest.entries) {
      await this.#s3.send(
        new DeleteObjectCommand({
          Bucket: this.#bucketName,
          Key: entry.chunkKey,
        })
      );
    }
  }

  #emptyTurnManifest(chronicleId: string): TurnChunkManifest {
    return TurnChunkManifestSchema.parse({
      chronicleId,
      chunkSize: this.#turnChunkSize,
      entries: [],
      latestSequence: 0,
      updatedAt: nowIso(),
    });
  }

  async #loadTurnManifest(chronicleId: string): Promise<TurnChunkManifest> {
    const key = this.#keys.chronicleManifest(chronicleId);
    const manifest = await readJson<TurnChunkManifest>(this.#s3, this.#bucketName, key);
    return manifest ?? this.#emptyTurnManifest(chronicleId);
  }

  async #persistTurnManifest(chronicleId: string, manifest: TurnChunkManifest): Promise<void> {
    const key = this.#keys.chronicleManifest(chronicleId);
    await writeJson(this.#s3, this.#bucketName, key, TurnChunkManifestSchema.parse(manifest));
  }

  #resolveTurnChunkEntry(manifest: TurnChunkManifest, turn: Turn): TurnChunkManifest['entries'][number] {
    const existing = manifest.entries.at(-1);
    if (!existing || existing.turnCount >= manifest.chunkSize) {
      const chunkIndex = manifest.entries.length;
      const chunkKey = this.#keys.chronicleTurnChunk(turn.chronicleId, chunkIndex);
      const entry = {
        chunkIndex,
        startSequence: turn.turnSequence,
        endSequence: turn.turnSequence,
        chunkKey,
        turnCount: 0,
        updatedAt: turn.createdAt,
      };
      manifest.entries.push(entry);
      return entry;
    }
    return existing;
  }

  async #loadTurnChunk(
    chronicleId: string,
    entry: TurnChunkManifest['entries'][number]
  ): Promise<TurnChunk> {
    const existing = await readJson<TurnChunk>(this.#s3, this.#bucketName, entry.chunkKey);
    if (existing) return TurnChunkSchema.parse(existing);
    return TurnChunkSchema.parse({
      chronicleId,
      chunkIndex: entry.chunkIndex,
      startSequence: entry.startSequence,
      endSequence: entry.endSequence,
      turns: [],
      updatedAt: entry.updatedAt,
    });
  }

  async #upsertTurnChunkRow(chronicleId: string, entry: TurnChunkManifest['entries'][number]): Promise<void> {
    const row: ChronicleTurnChunkRow = {
      PK: PK.chronicle(chronicleId),
      SK: SK.turnChunk(entry.chunkIndex),
      entityType: 'TURN_CHUNK',
      chronicleId,
      chunkIndex: entry.chunkIndex,
      startSequence: entry.startSequence,
      endSequence: entry.endSequence,
      chunkKey: entry.chunkKey,
      turnCount: entry.turnCount,
      updatedAt: entry.updatedAt,
    };
    await this.#docClient.send(
      new PutCommand({ TableName: this.#tableName, Item: row })
    );
  }

  async #updateChroniclePreview(
    chronicleId: string,
    turn: Turn,
    chunkCount: number
  ): Promise<void> {
    const owner = await this.#getChronicleOwner(chronicleId);
    if (!owner) return;
    await this.#docClient.send(
      new UpdateCommand({
        TableName: this.#tableName,
        Key: { PK: PK.tenant(owner.loginId), SK: SK.chronicle(chronicleId) },
        UpdateExpression: 'SET lastTurnPreview = :preview, turnChunkCount = :count, updatedAt = :updated',
        ExpressionAttributeValues: {
          ':preview': turnPreviewFromTurn(turn),
          ':count': chunkCount,
          ':updated': nowIso(),
        },
      })
    );
  }

  async #getChronicleOwner(
    chronicleId: string
  ): Promise<{ loginId: string } | null> {
    const res = await this.#docClient.send(
      new GetCommand({
        TableName: this.#tableName,
        Key: { PK: PK.chronicle(chronicleId), SK: SK.meta },
      })
    );
    if (!res.Item) return null;
    return { loginId: res.Item.loginId as string };
  }

  async #getCharacterRow(characterId: string): Promise<CharacterRow | null> {
    const res = await this.#docClient.send(
      new QueryCommand({
        TableName: this.#tableName,
        IndexName: this.#indexes.characterById,
        KeyConditionExpression: '#gsi = :pk',
        ExpressionAttributeNames: { '#gsi': 'GSI1PK' },
        ExpressionAttributeValues: { ':pk': PK.character(characterId) },
        Limit: 1,
      })
    );
    return (res.Items?.[0] as CharacterRow | undefined) ?? null;
  }

  async #getChronicleMeta(chronicleId: string): Promise<ChronicleMetaRow | null> {
    const res = await this.#docClient.send(
      new GetCommand({
        TableName: this.#tableName,
        Key: { PK: PK.chronicle(chronicleId), SK: SK.meta },
      })
    );
    return (res.Item as ChronicleMetaRow | undefined) ?? null;
  }

  async #getLocationMetadata(locationId: string): Promise<LocationRow | null> {
    const res = await this.#docClient.send(
      new GetCommand({
        TableName: this.#tableName,
        Key: { PK: PK.location(locationId), SK: SK.meta },
      })
    );
    if (!res.Item) return null;
    const summaryRes = await this.#docClient.send(
      new GetCommand({
        TableName: this.#tableName,
        Key: {
          PK: PK.tenant(res.Item.loginId as string),
          SK: SK.location(locationId),
        },
      })
    );
    return (summaryRes.Item as LocationRow) ?? null;
  }

  #emptyGraphManifest(locationId: string): LocationGraphManifest {
    return LocationGraphManifestSchema.parse({
      locationId,
      chunkSize: this.#turnChunkSize,
      entries: [],
      updatedAt: nowIso(),
    });
  }

  async #ingestGraphSnapshot(locationId: string, snapshot: LocationGraphSnapshot): Promise<void> {
    const parsed = LocationGraphSnapshotSchema.parse(snapshot);
    const chunkKey = this.#keys.locationGraphChunk(locationId, 0);
    const chunk: LocationGraphChunk = {
      locationId,
      chunkIndex: 0,
      nodeStart: 0,
      nodeCount: parsed.places.length,
      edgeCount: parsed.edges.length,
      places: parsed.places,
      edges: parsed.edges,
      updatedAt: nowIso(),
    };
    await writeJson(this.#s3, this.#bucketName, chunkKey, LocationGraphChunkSchema.parse(chunk));
    const manifest = await this.#loadGraphManifest(locationId);
    manifest.entries = [
      {
        chunkIndex: 0,
        nodeStart: 0,
        nodeCount: chunk.nodeCount,
        edgeCount: chunk.edgeCount,
        chunkKey,
        updatedAt: chunk.updatedAt,
      },
    ];
    manifest.updatedAt = chunk.updatedAt;
    await this.#persistGraphManifest(locationId, manifest);
    await this.#upsertGraphChunkRow(locationId, manifest.entries[0]);
    await this.#replaceNeighborPointers(locationId, parsed);
  }

  async #loadGraphManifest(locationId: string): Promise<LocationGraphManifest> {
    const key = this.#keys.locationManifest(locationId);
    const manifest = await readJson<LocationGraphManifest>(this.#s3, this.#bucketName, key);
    return manifest ?? this.#emptyGraphManifest(locationId);
  }

  async #persistGraphManifest(
    locationId: string,
    manifest: LocationGraphManifest
  ): Promise<void> {
    const key = this.#keys.locationManifest(locationId);
    await writeJson(this.#s3, this.#bucketName, key, LocationGraphManifestSchema.parse(manifest));
  }

  async #upsertGraphChunkRow(
    locationId: string,
    entry: LocationGraphManifest['entries'][number]
  ): Promise<void> {
    const row: LocationGraphChunkRow = {
      PK: PK.location(locationId),
      SK: SK.graphChunk(entry.chunkIndex),
      entityType: 'LOCATION_GRAPH_CHUNK',
      locationId,
      chunkIndex: entry.chunkIndex,
      nodeStart: entry.nodeStart,
      nodeCount: entry.nodeCount,
      edgeCount: entry.edgeCount,
      chunkKey: entry.chunkKey,
      updatedAt: entry.updatedAt,
    };
    await this.#docClient.send(
      new PutCommand({ TableName: this.#tableName, Item: row })
    );
  }

  async #replaceNeighborPointers(
    locationId: string,
    snapshot: LocationGraphSnapshot
  ): Promise<void> {
    const placeMap = new Map(snapshot.places.map((place) => [place.id, place]));
    if (placeMap.size === 0) return;
    await this.#deleteNeighborPointers(locationId, [...placeMap.keys()]);
    const requests: Array<{ PutRequest: { Item: LocationNeighborRow } }> = [];
    for (const edge of snapshot.edges) {
      const srcRow = this.#buildNeighborRow(locationId, edge.src, edge.dst, edge.kind, placeMap);
      if (srcRow) requests.push({ PutRequest: { Item: srcRow } });
      const dstRow = this.#buildNeighborRow(locationId, edge.dst, edge.src, edge.kind, placeMap);
      if (dstRow) requests.push({ PutRequest: { Item: dstRow } });
    }
    await this.#batchWrite(requests);
  }

  #buildNeighborRow(
    locationId: string,
    placeId: string,
    neighborPlaceId: string,
    relationKind: string,
    placeMap: Map<string, LocationPlace>
  ): LocationNeighborRow | null {
    const neighbor = placeMap.get(neighborPlaceId);
    if (!neighbor) return null;
    return {
      PK: PK.place(placeId),
      SK: SK.neighbor(relationKind, neighborPlaceId),
      entityType: 'LOCATION_NEIGHBOR',
      locationId,
      placeId,
      neighborPlaceId,
      relationKind,
      depth: 1,
      name: neighbor.name,
      breadcrumb: [
        {
          id: neighbor.id,
          kind: neighbor.kind,
          name: neighbor.name,
        },
      ],
      tags: neighbor.tags ?? [],
    };
  }

  async #deleteNeighborPointers(locationId: string, placeIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(placeIds)];
    for (const placeId of uniqueIds) {
      let cursor: Record<string, unknown> | undefined;
      do {
        const res = await this.#docClient.send(
          new QueryCommand({
            TableName: this.#tableName,
            KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
            ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK', '#loc': 'locationId' },
            ExpressionAttributeValues: {
              ':pk': PK.place(placeId),
              ':sk': 'NEIGHBOR#',
              ':loc': locationId,
            },
            FilterExpression: '#loc = :loc',
            ExclusiveStartKey: cursor,
          })
        );
        const deletes =
          res.Items?.map((item) => ({
            DeleteRequest: {
              Key: {
                PK: PK.place(placeId),
                SK: (item as LocationNeighborRow).SK,
              },
            },
          })) ?? [];
        await this.#batchWrite(deletes);
        cursor = res.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (cursor);
    }
  }

  async #batchWrite(
    requests: Array<
      { PutRequest: { Item: Record<string, unknown> } } | { DeleteRequest: { Key: Record<string, unknown> } }
    >
  ): Promise<void> {
    if (requests.length === 0) return;
    const CHUNK_SIZE = 25;
    for (let i = 0; i < requests.length; i += CHUNK_SIZE) {
      const chunk = requests.slice(i, i + CHUNK_SIZE);
      await this.#docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.#tableName]: chunk,
          },
        })
      );
    }
  }

  async #batchGet<T>(keys: Array<{ PK: string; SK: string }>): Promise<T[]> {
    const BATCH_SIZE = 100;
    const results: T[] = [];
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      let pending = keys.slice(i, i + BATCH_SIZE);
      while (pending.length > 0) {
        const response = await this.#docClient.send(
          new BatchGetCommand({
            RequestItems: {
              [this.#tableName]: {
                Keys: pending,
              },
            },
          })
        );
        const rows = response.Responses?.[this.#tableName] ?? [];
        for (const row of rows) {
          results.push(row as T);
        }
        const unprocessed =
          (response.UnprocessedKeys?.[this.#tableName]?.Keys as Array<Record<string, string>> | undefined) ?? [];
        pending = unprocessed.map((key) => ({ PK: key.PK, SK: key.SK }));
      }
    }
    return results;
  }

  async #loadAllChronicleTurns(chronicleId: string): Promise<Turn[]> {
    const turns: Turn[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const res = await this.#docClient.send(
        new QueryCommand({
          TableName: this.#tableName,
          KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
          ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
          ExpressionAttributeValues: { ':pk': PK.chronicle(chronicleId), ':sk': 'TURN_CHUNK#' },
          ExclusiveStartKey: cursor,
        })
      );
      for (const item of res.Items ?? []) {
        const pointer = item as ChronicleTurnChunkRow;
        const chunk = await readJson<TurnChunk>(this.#s3, this.#bucketName, pointer.chunkKey);
        if (chunk?.turns) {
          turns.push(...chunk.turns);
        }
      }
      cursor = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (cursor);
    return turns.sort((a, b) => a.turnSequence - b.turnSequence);
  }
}
