/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/strict-boolean-expressions */
import type { Character, Chronicle, Login, Player, Turn } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import { applyCharacterSnapshotProgress } from './characterProgress';
import { createPool, withTransaction } from './pg';
import type {
  CharacterProgressPayload,
  ChronicleSnapshot,
  LocationGraphStore,
  WorldStateStore,
} from './types';
import { isNonEmptyString, slugify } from './utils';

const ensureInventory = (character: Character): Character => {
  if (character.inventory !== undefined) {
    return character;
  }
  return {
    ...character,
    inventory: [],
  };
};

const normalizeChronicle = (chronicle: Chronicle): Chronicle => {
  const beatsEnabled =
    chronicle.beatsEnabled === undefined || chronicle.beatsEnabled === null
      ? true
      : Boolean(chronicle.beatsEnabled);
  const beats = Array.isArray(chronicle.beats) ? chronicle.beats : [];
  const summaries = Array.isArray(chronicle.summaries) ? chronicle.summaries : [];
  return {
    ...chronicle,
    beats,
    beatsEnabled,
    summaries,
  };
};

const serializeJson = (value: unknown): string => JSON.stringify(value ?? {});

const resolveTurnIndex = (turn: Turn): number => Math.max(turn.turnSequence ?? 0, 0);

const resolveText = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text;
  }
  return fallback;
};

class PostgresWorldStateStore implements WorldStateStore {
  readonly #pool: Pool;
  readonly #locationGraphStore: LocationGraphStore | null;

  constructor(options: { pool: Pool; locationGraphStore?: LocationGraphStore | null }) {
    this.#pool = options.pool;
    this.#locationGraphStore = options.locationGraphStore ?? null;
  }

  async ensureChronicle(params: {
    chronicleId?: string;
    loginId: string;
    locationId: string;
    characterId?: string;
    title?: string;
    status?: Chronicle['status'];
    seedText?: string | null;
    beatsEnabled?: boolean;
  }): Promise<Chronicle> {
    const chronicleId = params.chronicleId ?? randomUUID();
    const existing = await this.getChronicle(chronicleId);
    if (existing !== null) {
      return existing;
    }
    const record = this.#buildChronicleRecord(params, chronicleId);
    return this.upsertChronicle(record);
  }

  async getChronicleState(chronicleId: string): Promise<ChronicleSnapshot | null> {
    const chronicle = await this.getChronicle(chronicleId);
    if (chronicle === null) {
      return null;
    }
    const character = isNonEmptyString(chronicle.characterId)
      ? await this.getCharacter(chronicle.characterId)
      : null;
    const locationSummary =
      this.#locationGraphStore && isNonEmptyString(chronicle.locationId) && character?.id
        ? await this.#locationGraphStore.summarizeCharacterLocation({
          characterId: character.id,
          locationId: chronicle.locationId,
        })
        : null;
    const turns = await this.listChronicleTurns(chronicleId);
    const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
    const turnSequence = lastTurn?.turnSequence ?? -1;
    return {
      character,
      chronicle,
      chronicleId: chronicle.id,
      location: locationSummary,
      turns,
      turnSequence,
    };
  }

  async upsertLogin(login: Login): Promise<Login> {
    await this.#pool.query(
      `INSERT INTO login (id, login_name, email, metadata)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (id) DO UPDATE
       SET login_name = EXCLUDED.login_name,
           email = EXCLUDED.email,
           metadata = EXCLUDED.metadata`,
      [login.id, login.loginName, login.email ?? null, serializeJson(login.metadata ?? {})]
    );
    return login;
  }

  async getLogin(loginId: string): Promise<Login | null> {
    const result = await this.#pool.query(
      'SELECT id, login_name, email, metadata FROM login WHERE id = $1',
      [loginId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      email: row.email ?? undefined,
      id: row.id,
      loginName: row.login_name,
      metadata: row.metadata ?? undefined,
    };
  }

  async listLogins(): Promise<Login[]> {
    const result = await this.#pool.query(
      'SELECT id, login_name, email, metadata FROM login ORDER BY login_name ASC'
    );
    return result.rows.map((row) => ({
      email: row.email ?? undefined,
      id: row.id,
      loginName: row.login_name,
      metadata: row.metadata ?? undefined,
    }));
  }

  async upsertCharacter(character: Character): Promise<Character> {
    const normalized = ensureInventory(character);
    await withTransaction(this.#pool, async (client) => {
      await this.#ensureLogin(client, normalized.loginId);
      await this.#upsertNode(client, normalized.id, 'character', normalized);
      await client.query(
        `INSERT INTO character (id, login_id, name, tags, created_at, updated_at)
         VALUES ($1::uuid, $2, $3, $4::text[], now(), now())
         ON CONFLICT (id) DO UPDATE
         SET login_id = EXCLUDED.login_id,
             name = EXCLUDED.name,
             tags = EXCLUDED.tags,
             updated_at = now()`,
        [normalized.id, normalized.loginId, normalized.name, normalized.tags ?? []]
      );
    });
    return normalized;
  }

  async getCharacter(characterId: string): Promise<Character | null> {
    const result = await this.#pool.query(
      `SELECT n.props
       FROM character c
       JOIN node n ON n.id = c.id
       WHERE c.id = $1::uuid`,
      [characterId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const parsed = ensureInventory(row.props as Character);
    return parsed;
  }

  async listCharactersByLogin(loginId: string): Promise<Character[]> {
    const result = await this.#pool.query(
      `SELECT n.props
       FROM character c
       JOIN node n ON n.id = c.id
       WHERE c.login_id = $1
       ORDER BY c.created_at ASC`,
      [loginId]
    );
    return result.rows.map((row) => ensureInventory(row.props as Character));
  }

  async upsertPlayer(player: Player): Promise<Player> {
    await withTransaction(this.#pool, async (client) => {
      await this.#ensureLogin(client, player.loginId);
      await client.query(
        `INSERT INTO player (login_id, preferences, template_overrides, metadata, updated_at)
         VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, now())
         ON CONFLICT (login_id) DO UPDATE
         SET preferences = EXCLUDED.preferences,
             template_overrides = EXCLUDED.template_overrides,
             metadata = EXCLUDED.metadata,
             updated_at = now()`,
        [
          player.loginId,
          serializeJson(player.preferences ?? {}),
          serializeJson(player.templateOverrides ?? {}),
          serializeJson(player.metadata ?? {}),
        ]
      );
    });
    return player;
  }

  async getPlayer(loginId: string): Promise<Player | null> {
    const result = await this.#pool.query(
      'SELECT preferences, template_overrides, metadata FROM player WHERE login_id = $1',
      [loginId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      loginId,
      metadata: row.metadata ?? undefined,
      preferences: row.preferences ?? undefined,
      templateOverrides: row.template_overrides ?? undefined,
    };
  }

  async upsertChronicle(chronicle: Chronicle): Promise<Chronicle> {
    const normalized = normalizeChronicle(chronicle);
    await withTransaction(this.#pool, async (client) => {
      await this.#ensureLogin(client, normalized.loginId);
      await this.#ensureLocationExists(client, normalized.locationId, normalized.title);
      await this.#upsertNode(client, normalized.id, 'chronicle', normalized);
      await client.query(
        `INSERT INTO chronicle (
           id, title, primary_char_id, status, login_id, location_id, seed_text, beats_enabled, created_at, updated_at
         ) VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6::uuid, $7, $8, now(), now())
         ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title,
             primary_char_id = EXCLUDED.primary_char_id,
             status = EXCLUDED.status,
             login_id = EXCLUDED.login_id,
             location_id = EXCLUDED.location_id,
             seed_text = EXCLUDED.seed_text,
             beats_enabled = EXCLUDED.beats_enabled,
             updated_at = now()`,
        [
          normalized.id,
          normalized.title,
          normalized.characterId ?? null,
          normalized.status ?? 'open',
          normalized.loginId,
          normalized.locationId,
          normalized.seedText ?? null,
          normalized.beatsEnabled ?? true,
        ]
      );
    });
    return normalized;
  }

  async getChronicle(chronicleId: string): Promise<Chronicle | null> {
    const result = await this.#pool.query(
      `SELECT n.props
       FROM chronicle c
       JOIN node n ON n.id = c.id
       WHERE c.id = $1::uuid`,
      [chronicleId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return normalizeChronicle(row.props as Chronicle);
  }

  async listChroniclesByLogin(loginId: string): Promise<Chronicle[]> {
    const result = await this.#pool.query(
      `SELECT n.props
       FROM chronicle c
       JOIN node n ON n.id = c.id
       WHERE c.login_id = $1
       ORDER BY c.created_at ASC`,
      [loginId]
    );
    return result.rows.map((row) => normalizeChronicle(row.props as Chronicle));
  }

  async deleteChronicle(chronicleId: string): Promise<void> {
    await withTransaction(this.#pool, async (client) => {
      const turnIds = await client.query(
        'SELECT id FROM chronicle_turn WHERE chronicle_id = $1::uuid',
        [chronicleId]
      );
      await client.query('DELETE FROM chronicle_turn WHERE chronicle_id = $1::uuid', [
        chronicleId,
      ]);
      if (turnIds.rowCount && turnIds.rows.length > 0) {
        const ids = turnIds.rows.map((row) => row.id);
        await client.query('DELETE FROM node WHERE id = ANY($1::uuid[])', [ids]);
      }
      await client.query('DELETE FROM chronicle WHERE id = $1::uuid', [chronicleId]);
      await client.query('DELETE FROM node WHERE id = $1::uuid', [chronicleId]);
    });
  }

  async addTurn(turn: Turn): Promise<Turn> {
    const chronicleId = turn.chronicleId ?? null;
    if (!isNonEmptyString(chronicleId)) {
      throw new Error(`Chronicle ${chronicleId ?? '<unknown>'} not found for turn ${turn.id}`);
    }
    const chronicle = await this.getChronicle(chronicleId);
    if (chronicle === null) {
      throw new Error(`Chronicle ${chronicleId} not found for turn ${turn.id}`);
    }
    const turnIndex = resolveTurnIndex(turn);
    await withTransaction(this.#pool, async (client) => {
      await this.#upsertNode(client, turn.id, 'chronicle_turn', turn);
      await client.query(
        `INSERT INTO chronicle_turn (
           id, chronicle_id, turn_index, payload, player_input, gm_output, intent_json, created_at
         ) VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5, $6, $7::jsonb, now())
         ON CONFLICT (chronicle_id, turn_index) DO UPDATE
         SET payload = EXCLUDED.payload,
             player_input = EXCLUDED.player_input,
             gm_output = EXCLUDED.gm_output,
             intent_json = EXCLUDED.intent_json`,
        [
          turn.id,
          chronicleId,
          turnIndex,
          serializeJson(turn),
          resolveText(turn.playerMessage, ''),
          resolveText(turn.gmSummary ?? turn.gmResponse, ''),
          serializeJson(turn.playerIntent ?? {}),
        ]
      );
    });
    return turn;
  }

  async listChronicleTurns(chronicleId: string): Promise<Turn[]> {
    const result = await this.#pool.query(
      `SELECT payload
       FROM chronicle_turn
       WHERE chronicle_id = $1::uuid
       ORDER BY turn_index ASC`,
      [chronicleId]
    );
    return result.rows.map((row) => row.payload as Turn);
  }

  async applyCharacterProgress(update: CharacterProgressPayload): Promise<Character | null> {
    if (!isNonEmptyString(update.characterId)) {
      return null;
    }
    const character = await this.getCharacter(update.characterId);
    if (character === null) {
      return null;
    }
    const hasMomentumDelta = typeof update.momentumDelta === 'number' && update.momentumDelta !== 0;
    const hasSkillUpdate = update.skill !== undefined;
    if (!hasMomentumDelta && !hasSkillUpdate) {
      return character;
    }
    const next = applyCharacterSnapshotProgress(character, update);
    await this.upsertCharacter(next);
    return next;
  }

  async #ensureLogin(client: PoolClient, loginId: string): Promise<void> {
    await client.query(
      `INSERT INTO login (id, login_name, created_at)
       VALUES ($1, $2, now())
       ON CONFLICT (id) DO NOTHING`,
      [loginId, loginId]
    );
  }

  async #ensureLocationExists(
    client: PoolClient,
    locationId: string,
    name?: string | null
  ): Promise<void> {
    const lookup = await client.query('SELECT 1 FROM location WHERE id = $1::uuid', [locationId]);
    if (lookup.rowCount && lookup.rows.length > 0) {
      return;
    }
    const slug = slugify(name ?? locationId);
    await this.#upsertNode(
      client,
      locationId,
      'location',
      {
        canonicalParentId: undefined,
        description: name ?? undefined,
        id: locationId,
        kind: 'locale',
        locationId,
        name: name ?? 'Unknown Location',
        tags: [],
      }
    );
    await client.query(
      `INSERT INTO location (
         id, slug, name, kind, biome, tags, ltree_path, location_root, canonical_parent, description, created_at, updated_at
       ) VALUES ($1::uuid, $2, $3, $4, NULL, $5::text[], text2ltree($6), $1::uuid, NULL, $7, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [locationId, slug, name ?? 'Unknown Location', 'locale', [], slug, name ?? null]
    );
  }

  async #upsertNode(client: PoolClient, id: string, kind: string, props: unknown): Promise<void> {
    await client.query(
      `INSERT INTO node (id, kind, props, created_at)
       VALUES ($1::uuid, $2, $3::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, props = EXCLUDED.props`,
      [id, kind, serializeJson(props)]
    );
  }
}

export function createWorldStateStore(options?: {
  connectionString?: string;
  pool?: Pool;
  locationGraphStore?: LocationGraphStore | null;
}): WorldStateStore {
  const pool = createPool({
    connectionString: options?.connectionString,
    pool: options?.pool,
  });
  const store = new PostgresWorldStateStore({
    locationGraphStore: options?.locationGraphStore ?? null,
    pool,
  });
  return store;
}
