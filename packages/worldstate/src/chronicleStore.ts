import type {
  Character,
  Chronicle,
  ChronicleSummaryEntry,
  LocationEntity,
  Turn,
} from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import { ChronicleTurnPersistence } from './chronicleTurnPersistence';
import { GraphOperations } from './graphOperations';
import { createPool, withTransaction } from './pg';
import type {
  ChronicleSnapshot,
  WorldSchemaStore,
  ChronicleStore,
} from './types';
import { isNonEmptyString } from './utils';
import { createWorldSchemaStore } from './worldSchemaStore';

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

type SessionStateRow = {
  character_state: Character | null;
  last_turn_sequence: number;
  location_state: LocationEntity | null;
};

type CharacterRow = { inventory: Character['inventory'] | null; props: Character };
type ChronicleRow = {
  anchor_entity_id: string | null;
  entity_focus: Chronicle['entityFocus'] | null;
  props: Chronicle;
};

const resolveSessionTurnSequence = (
  session: SessionStateRow | undefined,
  turns: Turn[]
): number => session?.last_turn_sequence ?? turns.at(-1)?.turnSequence ?? -1;

class PostgresChronicleStore implements ChronicleStore {
  readonly #pool: Pool;
  readonly #graph: GraphOperations;
  readonly #worldStore: WorldSchemaStore | null;
  readonly #turns: ChronicleTurnPersistence;

  constructor(options: { pool: Pool; graph?: GraphOperations; worldStore?: WorldSchemaStore | null }) {
    this.#pool = options.pool;
    this.#graph = options.graph ?? new GraphOperations(options.pool);
    this.#worldStore = options.worldStore ?? createWorldSchemaStore({ graph: this.#graph, pool: this.#pool });
    this.#turns = new ChronicleTurnPersistence(this.#pool, this.#graph);
  }

  get graph(): GraphOperations {
    return this.#graph;
  }

  async ensureChronicle(params: {
    chronicleId?: string;
    playerId: string;
    locationId: string;
    characterId?: string;
    title?: string;
    status?: Chronicle['status'];
    seedText?: string | null;
    beatsEnabled?: boolean;
    anchorEntityId?: string | null;
    sessionLocation?: LocationEntity;
  }): Promise<Chronicle> {
    const chronicleId = params.chronicleId ?? randomUUID();
    const existing = await this.getChronicle(chronicleId);
    if (existing !== null) {
      return existing;
    }
    const record = this.#buildChronicleRecord(params, chronicleId);
    const character = isNonEmptyString(record.characterId)
      ? await this.getCharacter(record.characterId)
      : null;
    const location =
      params.sessionLocation ??
      (this.#worldStore === null ? null : await this.#summarizeLocation(record.locationId));
    if (location === null) {
      throw new Error(
        `Location ${record.locationId} not found; provide chronicle-scoped session location state.`
      );
    }
    await withTransaction(this.#pool, async (client) => {
      await this.#persistChronicle(client, record);
      await client.query(
        `INSERT INTO chronicle_session_state (
           chronicle_id, character_state, location_state, last_turn_sequence, updated_at
         ) VALUES ($1::uuid, $2::jsonb, $3::jsonb, -1, now())
         ON CONFLICT (chronicle_id) DO NOTHING`,
        [
          chronicleId,
          character === null ? null : serializeJson(character),
          location === null ? null : serializeJson(location),
        ]
      );
    });
    return record;
  }

  async getChronicleState(chronicleId: string): Promise<ChronicleSnapshot | null> {
    const chronicle = await this.getChronicle(chronicleId);
    if (chronicle === null) {
      return null;
    }
    const [session, canonicalCharacter, canonicalLocation, turns] = await Promise.all([
      this.#getSessionState(chronicleId),
      this.#getCanonicalCharacter(chronicle),
      this.#getCanonicalLocation(chronicle),
      this.listChronicleTurns(chronicleId),
    ]);
    return {
      character: session?.character_state ?? canonicalCharacter,
      chronicle,
      chronicleId: chronicle.id,
      location: session?.location_state ?? canonicalLocation,
      turns,
      turnSequence: resolveSessionTurnSequence(session, turns),
    };
  }

  async upsertCharacter(character: Character): Promise<Character> {
    const normalized: Character = ensureInventory({
      ...character,
      playerId: character.playerId,
    });
    await withTransaction(this.#pool, async (client) => {
      await this.#persistCharacter(client, normalized);
    });
    return normalized;
  }

  async getCharacter(characterId: string): Promise<Character | null> {
    const result = await this.#pool.query<CharacterRow>(
      `SELECT n.props, c.inventory
       FROM character c
       JOIN node n ON n.id = c.id
       WHERE c.id = $1::uuid`,
      [characterId]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    const character = ensureInventory(row.props);
    // Explicitly merge inventory from character table to ensure it's present
    return {
      ...character,
      inventory: row.inventory ?? character.inventory ?? [],
    };
  }

  async listCharactersByPlayer(playerId: string): Promise<Character[]> {
    const result = await this.#pool.query<CharacterRow>(
      `SELECT n.props, c.inventory
       FROM character c
       JOIN node n ON n.id = c.id
       WHERE c.player_id = $1
       ORDER BY c.created_at ASC`,
      [playerId]
    );
    return result.rows.map((row) => {
      const character = ensureInventory(row.props);
      return {
        ...character,
        inventory: row.inventory ?? character.inventory ?? [],
      };
    });
  }

  async upsertChronicle(chronicle: Chronicle): Promise<Chronicle> {
    const normalized = normalizeChronicle(chronicle);
    await withTransaction(this.#pool, async (client) => {
      await this.#persistChronicle(client, normalized);
    });
    return normalized;
  }

  async commitClosureSummary(input: {
    character?: Character;
    chronicleId: string;
    entry: ChronicleSummaryEntry;
  }): Promise<boolean> {
    return withTransaction(this.#pool, async (client) => {
      const result = await client.query<{ props: Chronicle }>(
        `SELECT n.props
         FROM chronicle c
         JOIN node n ON n.id = c.id
         WHERE c.id = $1::uuid
         FOR UPDATE OF c, n`,
        [input.chronicleId]
      );
      const stored = result.rows[0]?.props;
      if (stored === undefined) {
        throw new Error(`Chronicle ${input.chronicleId} not found while recording closure summary.`);
      }
      const chronicle = normalizeChronicle(stored);
      if (chronicle.summaries.some((summary) => summary.kind === input.entry.kind)) {
        return false;
      }
      if (input.character !== undefined) {
        if (
          input.character.id !== chronicle.characterId ||
          input.character.playerId !== chronicle.playerId
        ) {
          throw new Error('Closure character does not match the chronicle owner.');
        }
        await this.#persistCharacter(client, ensureInventory(input.character));
      }
      await this.#persistChronicle(client, {
        ...chronicle,
        summaries: [...chronicle.summaries, input.entry],
      });
      return true;
    });
  }

  async getChronicle(chronicleId: string): Promise<Chronicle | null> {
    const result = await this.#pool.query<ChronicleRow>(
      `SELECT n.props, c.anchor_entity_id, c.entity_focus
       FROM chronicle c
       JOIN node n ON n.id = c.id
       WHERE c.id = $1::uuid`,
      [chronicleId]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    const normalizedProps = normalizeChronicle(row.props);
    return normalizeChronicle({
      ...normalizedProps,
      anchorEntityId: row.anchor_entity_id ?? normalizedProps.anchorEntityId,
      entityFocus: row.entity_focus ?? normalizedProps.entityFocus ?? { entityScores: {}, tagScores: {} },
    });
  }

  async listChroniclesByPlayer(playerId: string): Promise<Chronicle[]> {
    const result = await this.#pool.query<{ props: Chronicle }>(
      `SELECT n.props
       FROM chronicle c
       JOIN node n ON n.id = c.id
       WHERE c.player_id = $1
       ORDER BY c.created_at ASC`,
      [playerId]
    );
    return result.rows.map((row) => normalizeChronicle(row.props));
  }

  async deleteChronicle(chronicleId: string): Promise<void> {
    await withTransaction(this.#pool, async (client) => {
      await this.#turns.deleteForChronicle(client, chronicleId);
      await client.query('DELETE FROM chronicle WHERE id = $1::uuid', [chronicleId]);
      await client.query('DELETE FROM node WHERE id = $1::uuid', [chronicleId]);
    });
  }

  async commitTurn(input: {
    character: Character | null;
    chronicle: Chronicle;
    location: LocationEntity | null;
    turn: Turn;
  }): Promise<Turn> {
    const chronicle = normalizeChronicle(input.chronicle);
    return this.#turns.commit(
      { ...input, chronicle },
      async (client, storedChronicle) => this.#persistChronicle(client, storedChronicle)
    );
  }

  async listChronicleTurns(chronicleId: string): Promise<Turn[]> {
    return this.#turns.list(chronicleId);
  }

  async #assertPlayerExists(
    playerId: string,
    executor: Pool | PoolClient = this.#pool
  ): Promise<void> {
    const lookup = await executor.query('SELECT 1 FROM app.player WHERE id = $1', [playerId]);
    if (lookup.rowCount === 0) {
      throw new Error(`Player ${playerId} not found in app schema`);
    }
  }

  #buildChronicleRecord(
    params: {
      playerId: string;
      locationId: string;
      characterId?: string;
      title?: string;
      status?: Chronicle['status'];
      seedText?: string | null;
      beatsEnabled?: boolean;
      anchorEntityId?: string | null;
    },
    chronicleId: string
  ): Chronicle {
    return normalizeChronicle({
      anchorEntityId: params.anchorEntityId ?? undefined,
      beats: [],
      beatsEnabled: params.beatsEnabled ?? true,
      characterId: params.characterId,
      entityFocus: { entityScores: {}, tagScores: {} },
      id: chronicleId,
      locationId: params.locationId,
      playerId: params.playerId,
      seedText: params.seedText ?? undefined,
      status: params.status ?? 'open',
      summaries: [],
      title: params.title ?? 'Untitled Chronicle',
    });
  }

  async #getSessionState(chronicleId: string): Promise<SessionStateRow | undefined> {
    const result = await this.#pool.query<SessionStateRow>(
      `SELECT character_state, last_turn_sequence, location_state
       FROM chronicle_session_state WHERE chronicle_id = $1::uuid`,
      [chronicleId]
    );
    return result.rows[0];
  }

  async #getCanonicalCharacter(chronicle: Chronicle): Promise<Character | null> {
    return isNonEmptyString(chronicle.characterId)
      ? this.getCharacter(chronicle.characterId)
      : null;
  }

  async #getCanonicalLocation(chronicle: Chronicle): Promise<LocationEntity | null> {
    return this.#worldStore !== null && isNonEmptyString(chronicle.locationId)
      ? this.#summarizeLocation(chronicle.locationId)
      : null;
  }

  async #persistCharacter(client: PoolClient, character: Character): Promise<void> {
    await this.#assertPlayerExists(character.playerId, client);
    await this.#graph.upsertNode(client, character.id, 'character', character);
    await client.query(
      `INSERT INTO character (
         id, player_id, name, tags, archetype, pronouns, bio,
         attributes, skills, inventory, momentum, created_at, updated_at
       ) VALUES (
         $1::uuid, $2, $3, $4::text[], $5, $6, $7,
         $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, now(), now()
       ) ON CONFLICT (id) DO UPDATE SET
         player_id = EXCLUDED.player_id, name = EXCLUDED.name,
         tags = EXCLUDED.tags, archetype = EXCLUDED.archetype,
         pronouns = EXCLUDED.pronouns, bio = EXCLUDED.bio,
         attributes = EXCLUDED.attributes, skills = EXCLUDED.skills,
         inventory = EXCLUDED.inventory, momentum = EXCLUDED.momentum,
         updated_at = now()`,
      [
        character.id,
        character.playerId,
        character.name,
        character.tags ?? [],
        character.archetype,
        character.pronouns,
        character.bio ?? null,
        serializeJson(character.attributes),
        serializeJson(character.skills),
        serializeJson(character.inventory),
        serializeJson(character.momentum),
      ]
    );
  }

  async #persistChronicle(client: PoolClient, chronicle: Chronicle): Promise<void> {
    await this.#assertPlayerExists(chronicle.playerId, client);
    if (isNonEmptyString(chronicle.anchorEntityId)) {
      await this.#assertAnchorExists(client, chronicle.anchorEntityId);
    }
    await this.#graph.upsertNode(client, chronicle.id, 'chronicle', chronicle);
    await client.query(
      `INSERT INTO chronicle (
         id, title, primary_char_id, status, player_id, location_id,
         seed_text, beats_enabled, anchor_entity_id, entity_focus, created_at, updated_at
       ) VALUES (
         $1::uuid, $2, $3::uuid, $4, $5, $6::uuid,
         $7, $8, $9::uuid, $10::jsonb, now(), now()
       ) ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, primary_char_id = EXCLUDED.primary_char_id,
         status = EXCLUDED.status, player_id = EXCLUDED.player_id,
         location_id = EXCLUDED.location_id, seed_text = EXCLUDED.seed_text,
         beats_enabled = EXCLUDED.beats_enabled,
         anchor_entity_id = EXCLUDED.anchor_entity_id,
         entity_focus = EXCLUDED.entity_focus, updated_at = now()`,
      [
        chronicle.id,
        chronicle.title,
        chronicle.characterId ?? null,
        chronicle.status ?? 'open',
        chronicle.playerId,
        chronicle.locationId,
        chronicle.seedText ?? null,
        chronicle.beatsEnabled ?? true,
        chronicle.anchorEntityId ?? null,
        JSON.stringify(chronicle.entityFocus ?? { entityScores: {}, tagScores: {} }),
      ]
    );
  }

  async #summarizeLocation(locationId: string): Promise<LocationEntity | null> {
    if (this.#worldStore === null) {
      return null;
    }
    try {
      const state = await this.#worldStore.getEntity({ id: locationId });
      if (state === null || state.kind !== 'location') {
        return null;
      }
      return {
        createdAt: state.createdAt,
        description: state.description ?? undefined,
        id: state.id,
        kind: 'location',
        name: state.name,
        prominence: state.prominence ?? 'recognized',
        slug: state.slug,
        status: state.status ?? undefined,
        subkind: state.subkind ?? undefined,
        tags: [],
        updatedAt: state.updatedAt,
      };
    } catch {
      return null;
    }
  }

  async #assertAnchorExists(client: PoolClient, anchorEntityId: string): Promise<void> {
    const lookup = await client.query('SELECT 1 FROM hard_state WHERE id = $1::uuid', [anchorEntityId]);
    if (lookup.rowCount === 0) {
      throw new Error(`Anchor entity ${anchorEntityId} not found`);
    }
  }

}

export function createChronicleStore(options?: {
  connectionString?: string;
  pool?: Pool;
  graph?: GraphOperations;
  worldStore?: WorldSchemaStore | null;
}): ChronicleStore {
  const pool = createPool({
    connectionString: options?.connectionString,
    pool: options?.pool,
  });
  const store = new PostgresChronicleStore({
    graph: options?.graph,
    pool,
    worldStore: options?.worldStore ?? null,
  });
  return store;
}
