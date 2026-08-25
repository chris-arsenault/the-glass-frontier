import type {
  Character,
  Chronicle,
  ChronicleActivity,
  ChronicleSummaryEntry,
  Turn,
} from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import { persistCharacter } from './characterPersistence';
import {
  applyBeatDispositions,
  ensureInventory,
  initialEntityRoster,
  normalizeChronicle,
} from './chronicleNormalization';
import {
  type CharacterRow,
  type ChronicleRow,
  resolveSessionTurnSequence,
  type SessionStateRow,
} from './chronicleRows';
import {
  ChronicleTurnPersistence,
  type TurnSearchInput,
  type TurnWindowInput,
} from './chronicleTurnPersistence';
import { foundingBeats } from './foundingBeat';
import { upsertNodeIdentity } from './nodeIdentity';
import { createPool, withTransaction } from './pg';
import type { ChronicleSnapshot, ChronicleStore } from './types';
import { isNonEmptyString, serializeJson } from './utils';

/**
 * Session storage. Holds one player's chronicle, character, and turns.
 *
 * It does not read canon. A chronicle names the canon entity it was anchored to
 * and the place it started from, but where it is now is a name that play sets,
 * so nothing here traverses the graph.
 */
class PostgresChronicleStore implements ChronicleStore {
  readonly #pool: Pool;
  readonly #turns: ChronicleTurnPersistence;

  constructor(options: { pool: Pool }) {
    this.#pool = options.pool;
    this.#turns = new ChronicleTurnPersistence(this.#pool);
  }

  async ensureChronicle(params: {
    chronicleId?: string;
    playerId: string;
    locationName: string;
    locationId?: string | null;
    characterId?: string;
    openingText?: string;
    title?: string;
    status?: Chronicle['status'];
    seedText?: string | null;
    anchorEntityId?: string | null;
    toneChips?: string[];
    toneNotes?: string;
    entityRoster?: Chronicle['entityRoster'];
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
    await withTransaction(this.#pool, async (client) => {
      await this.#persistChronicle(client, record);
      await client.query(
        `INSERT INTO chronicle_session_state (
           chronicle_id, character_state, last_turn_sequence, updated_at
         ) VALUES ($1::uuid, $2::jsonb, -1, now())
         ON CONFLICT (chronicle_id) DO NOTHING`,
        [chronicleId, character === null ? null : serializeJson(character)]
      );
    });
    return record;
  }

  async getChronicleState(chronicleId: string): Promise<ChronicleSnapshot | null> {
    const chronicle = await this.getChronicle(chronicleId);
    if (chronicle === null) {
      return null;
    }
    const [session, canonicalCharacter, turns] = await Promise.all([
      this.#getSessionState(chronicleId),
      this.#getCanonicalCharacter(chronicle),
      this.listChronicleTurns(chronicleId),
    ]);
    return {
      character: session?.character_state ?? canonicalCharacter,
      chronicle,
      chronicleId: chronicle.id,
      locationName: chronicle.locationName,
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
      `SELECT c.props, c.inventory
       FROM character c
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
      `SELECT c.props, c.inventory
       FROM character c
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

  async setChronicleTargetEnd(
    chronicleId: string,
    targetEndTurn: number | null
  ): Promise<Chronicle> {
    return withTransaction(this.#pool, async (client) => {
      const result = await client.query<{ props: Chronicle }>(
        `SELECT c.props
         FROM chronicle c
         WHERE c.id = $1::uuid
         FOR UPDATE OF c`,
        [chronicleId]
      );
      const stored = result.rows[0]?.props;
      if (stored === undefined) {
        throw new Error(`Chronicle ${chronicleId} not found while setting target end turn.`);
      }
      const chronicle = normalizeChronicle({
        ...normalizeChronicle(stored),
        targetEndTurn: targetEndTurn ?? undefined,
      });
      await this.#persistChronicle(client, chronicle);
      return chronicle;
    });
  }

  async commitClosureSummary(input: {
    character?: Character;
    chronicleId: string;
    entry: ChronicleSummaryEntry;
  }): Promise<boolean> {
    return withTransaction(this.#pool, async (client) => {
      const result = await client.query<{ props: Chronicle }>(
        `SELECT c.props
         FROM chronicle c
         WHERE c.id = $1::uuid
         FOR UPDATE OF c`,
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

  /**
   * Applies close-time dispositions to beats that are still open. A beat that
   * already reached a terminal state keeps it, so a retried closure changes
   * nothing on the second pass.
   */
  async finalizeBeats(input: {
    chronicleId: string;
    dispositions: Array<{ beatId: string; status: 'abandoned' | 'failed' | 'succeeded' }>;
  }): Promise<boolean> {
    return withTransaction(this.#pool, async (client) => {
      const result = await client.query<{ props: Chronicle }>(
        `SELECT c.props
         FROM chronicle c
         WHERE c.id = $1::uuid
         FOR UPDATE OF c`,
        [input.chronicleId]
      );
      const stored = result.rows[0]?.props;
      if (stored === undefined) {
        throw new Error(`Chronicle ${input.chronicleId} not found while finalizing beats.`);
      }
      const chronicle = normalizeChronicle(stored);
      const statusByBeatId = new Map(
        input.dispositions.map((disposition) => [disposition.beatId, disposition.status])
      );
      const { beats, changed } = applyBeatDispositions(chronicle.beats, statusByBeatId, Date.now());
      if (changed) {
        await this.#persistChronicle(client, { ...chronicle, beats });
      }
      return changed;
    });
  }

  async getChronicle(chronicleId: string): Promise<Chronicle | null> {
    const result = await this.#pool.query<ChronicleRow>(
      `SELECT c.props, c.anchor_entity_id, c.entity_focus
       FROM chronicle c
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

  /**
   * Cross-player landing activity. Closed chronicles are visible to every
   * authenticated player; callers explicitly opt member-tier viewers into
   * open chronicles. Each status gets its own cap so one cannot crowd out the
   * other.
   */
  async listChronicleActivity(
    includeActive: boolean,
    limitPerStatus = 5
  ): Promise<ChronicleActivity[]> {
    const capped = Math.max(1, Math.min(limitPerStatus, 20));
    const result = await this.#pool.query<{
      character_name: string | null;
      id: string;
      location_name: string;
      props: Chronicle;
      status: Chronicle['status'];
      title: string;
      updated_at: Date;
    }>(
      `WITH ranked_activity AS (
         SELECT c.id, c.title, c.location_name, c.status, c.updated_at, c.props,
                ch.name AS character_name,
                row_number() OVER (
                  PARTITION BY c.status
                  ORDER BY c.updated_at DESC
                ) AS status_rank
         FROM chronicle c
         LEFT JOIN character ch ON ch.id = c.primary_char_id
         WHERE c.status = 'closed' OR ($1::boolean AND c.status = 'open')
       )
       SELECT id, title, location_name, status, updated_at, props, character_name
       FROM ranked_activity
       WHERE status_rank <= $2
       ORDER BY updated_at DESC`,
      [includeActive, capped]
    );
    return result.rows.map((row) => {
      const chronicle = normalizeChronicle(row.props);
      const story = chronicle.summaries.find((summary) => summary.kind === 'chronicle_story');
      return {
        activityAt: row.updated_at.getTime(),
        characterName: row.character_name,
        hook: row.status === 'closed' ? story?.summary ?? null : null,
        id: row.id,
        locationName: row.location_name,
        status: row.status,
        title: row.title,
      };
    });
  }

  async listChroniclesByPlayer(playerId: string): Promise<Chronicle[]> {
    const result = await this.#pool.query<{ props: Chronicle }>(
      `SELECT c.props
       FROM chronicle c
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

  async listTurnWindow(input: TurnWindowInput): Promise<Turn[]> {
    return this.#turns.listWindow(input);
  }

  async searchTurns(input: TurnSearchInput): Promise<Turn[]> {
    return this.#turns.search(input);
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
      locationName: string;
      locationId?: string | null;
      characterId?: string;
      openingText?: string;
      title?: string;
      status?: Chronicle['status'];
      seedText?: string | null;
      anchorEntityId?: string | null;
      toneChips?: string[];
      toneNotes?: string;
      entityRoster?: Chronicle['entityRoster'];
    },
    chronicleId: string
  ): Chronicle {
    return normalizeChronicle({
      activeScene: null,
      anchorEntityId: params.anchorEntityId ?? undefined,
      beats: foundingBeats(params.title, params.seedText),
      characterId: params.characterId,
      entityFocus: { entityScores: {}, tagScores: {} },
      entityRoster: initialEntityRoster(params.locationName, params.entityRoster),
      id: chronicleId,
      locationId: params.locationId ?? undefined,
      locationName: params.locationName,
      openingText: params.openingText ?? '',
      playerId: params.playerId,
      sceneLedger: null,
      seedText: params.seedText ?? undefined,
      status: params.status ?? 'open',
      summaries: [],
      title: params.title ?? 'Untitled Chronicle',
      toneChips: params.toneChips ?? [],
      toneNotes: params.toneNotes ?? '',
    });
  }

  async #getSessionState(chronicleId: string): Promise<SessionStateRow | undefined> {
    const result = await this.#pool.query<SessionStateRow>(
      `SELECT character_state, last_turn_sequence
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

  async #persistCharacter(client: PoolClient, character: Character): Promise<void> {
    await this.#assertPlayerExists(character.playerId, client);
    await persistCharacter(client, character);
  }

  async #persistChronicle(client: PoolClient, chronicle: Chronicle): Promise<void> {
    await this.#assertPlayerExists(chronicle.playerId, client);
    if (isNonEmptyString(chronicle.anchorEntityId)) {
      await this.#assertAnchorExists(client, chronicle.anchorEntityId);
    }
    await upsertNodeIdentity(client, chronicle.id, 'chronicle');
    await client.query(
      `INSERT INTO chronicle (
         id, title, primary_char_id, status, player_id, location_name, location_id,
         seed_text, anchor_entity_id, entity_focus, props,
         created_at, updated_at
       ) VALUES (
         $1::uuid, $2, $3::uuid, $4, $5, $6, $7::uuid,
         $8, $9::uuid, $10::jsonb, $11::jsonb, now(), now()
       ) ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, primary_char_id = EXCLUDED.primary_char_id,
         status = EXCLUDED.status, player_id = EXCLUDED.player_id,
         location_name = EXCLUDED.location_name,
         location_id = EXCLUDED.location_id, seed_text = EXCLUDED.seed_text,
         anchor_entity_id = EXCLUDED.anchor_entity_id,
         entity_focus = EXCLUDED.entity_focus, props = EXCLUDED.props,
         updated_at = now()`,
      [
        chronicle.id,
        chronicle.title,
        chronicle.characterId ?? null,
        chronicle.status ?? 'open',
        chronicle.playerId,
        chronicle.locationName,
        chronicle.locationId ?? null,
        chronicle.seedText ?? null,
        chronicle.anchorEntityId ?? null,
        JSON.stringify(chronicle.entityFocus ?? { entityScores: {}, tagScores: {} }),
        serializeJson(chronicle),
      ]
    );
  }

  async #assertAnchorExists(client: PoolClient, anchorEntityId: string): Promise<void> {
    const lookup = await client.query('SELECT 1 FROM entity WHERE id = $1::uuid', [anchorEntityId]);
    if (lookup.rowCount === 0) {
      throw new Error(`Anchor entity ${anchorEntityId} not found`);
    }
  }

}

export function createChronicleStore(options?: {
  connectionString?: string;
  pool?: Pool;
}): ChronicleStore {
  const pool = createPool({
    connectionString: options?.connectionString,
    pool: options?.pool,
  });
  return new PostgresChronicleStore({ pool });
}
