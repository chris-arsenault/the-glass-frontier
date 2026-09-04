import type { Character, Chronicle, Turn } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import { normalizeChronicle } from './chronicleNormalization';
import { upsertNodeIdentity } from './nodeIdentity';
import { withTransaction } from './pg';
import { orSearchQuery } from './utils';

export type CommitTurnInput = {
  character: Character | null;
  chronicle: Chronicle;
  turn: Turn;
};

export type TurnWindowInput = {
  chronicleId: string;
  fromSequence?: number;
  toSequence?: number;
  limit?: number;
};

export type TurnSearchInput = {
  chronicleId: string;
  query: string;
  limit?: number;
};

type PersistChronicle = (client: PoolClient, chronicle: Chronicle) => Promise<void>;
type PersistTurnInput = {
  chronicleId: string;
  chronicleState: Chronicle;
  sequence: number;
  turn: Turn;
};
type TurnRow = {
  id: string;
  chronicle_id: string;
  chronicle_state: Chronicle | null;
  turn_sequence: number;
  executed_nodes: Turn['executedNodes'] | null;
  failure: Turn['failure'];
  advances_timeline: Turn['advancesTimeline'] | null;
  player_message_id: string;
  player_message_content: string;
  player_message_metadata: Turn['playerMessage']['metadata'] | null;
  player_intent: Turn['playerIntent'] | null;
  gm_response_id: string | null;
  gm_response_content: string | null;
  gm_response_metadata: NonNullable<Turn['gmResponse']>['metadata'] | null;
  gm_summary: Turn['gmSummary'] | null;
  system_message_id: string | null;
  system_message_content: string | null;
  system_message_metadata: NonNullable<Turn['systemMessage']>['metadata'] | null;
  skill_check_plan: Turn['skillCheckPlan'] | null;
  skill_check_result: Turn['skillCheckResult'] | null;
  inventory_delta: Turn['inventoryDelta'] | null;
  location_delta: Turn['locationDelta'] | null;
  gm_trace: Turn['gmTrace'] | null;
  prose_alternates: Turn['proseAlternates'] | null;
  prose_cost_usd: number | null;
  entity_references: Turn['entityReferences'] | null;
  entity_roster: Turn['entityRoster'] | null;
  entity_usage: Turn['entityUsage'] | null;
  player_reference_slugs: Turn['playerReferenceSlugs'] | null;
  reference_usage: Turn['referenceUsage'] | null;
  reference_mentions: Turn['referenceMentions'] | null;
  world_content: string | null;
};

const TURN_SELECT = `SELECT id, chronicle_id, chronicle_state, turn_sequence,
  executed_nodes, failure, advances_timeline,
  player_message_id, player_message_content, player_message_metadata,
  player_intent,
  gm_response_id, gm_response_content, gm_response_metadata, gm_summary,
  system_message_id, system_message_content, system_message_metadata,
  skill_check_plan, skill_check_result, inventory_delta, location_delta,
  gm_trace, prose_alternates, prose_cost_usd,
  entity_roster, entity_references, entity_usage,
  player_reference_slugs, reference_usage, reference_mentions,
  world_content
  FROM chronicle_turn`;

const TURN_INSERT = `INSERT INTO chronicle_turn (
  id, chronicle_id, turn_sequence, created_at, chronicle_state,
  executed_nodes, failure, advances_timeline,
  player_message_id, player_message_content, player_message_metadata,
  player_intent,
  gm_response_id, gm_response_content, gm_response_metadata, gm_summary,
  system_message_id, system_message_content, system_message_metadata,
  skill_check_plan, skill_check_result, inventory_delta, location_delta,
  gm_trace, prose_alternates, prose_cost_usd,
  entity_roster, entity_references, entity_usage,
  player_reference_slugs, reference_usage, reference_mentions,
  world_content
) VALUES (
  $1::uuid, $2::uuid, $3, now(), $4::jsonb, $5, $6, $7,
  $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14::jsonb, $15,
  $16, $17, $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, $22::jsonb,
  $23::jsonb, $24::jsonb, $25, $26::jsonb, $27::jsonb, $28::jsonb,
  $29::text[], $30::jsonb, $31::jsonb, $32
)`;

const serializeJson = (value: unknown): string => JSON.stringify(value ?? {});
const optionalJson = (value: unknown): string | null =>
  value === undefined ? null : serializeJson(value);
const optional = <T>(value: T | null): T | undefined => value ?? undefined;
const valueOr = <T>(value: T | undefined, fallback: T): T =>
  value === undefined ? fallback : value;

export const resolveTurnIndex = (turn: Turn): number =>
  Math.max(turn.turnSequence ?? 0, 0);

const defaultMetadata = (): Turn['playerMessage']['metadata'] => ({
  tags: [],
  timestamp: Date.now(),
});

const toGmResponse = (row: TurnRow): Turn['gmResponse'] => {
  if (row.gm_response_id === null || row.gm_response_content === null) {
    return undefined;
  }
  return {
    content: row.gm_response_content,
    id: row.gm_response_id,
    metadata: row.gm_response_metadata ?? defaultMetadata(),
    role: 'gm',
  };
};

const toSystemMessage = (row: TurnRow): Turn['systemMessage'] => {
  if (row.system_message_id === null || row.system_message_content === null) {
    return undefined;
  }
  return {
    content: row.system_message_content,
    id: row.system_message_id,
    metadata: row.system_message_metadata ?? defaultMetadata(),
    role: 'system',
  };
};

const toTurn = (row: TurnRow): Turn => ({
  advancesTimeline: optional(row.advances_timeline),
  canBranch: row.chronicle_state !== null,
  chronicleId: row.chronicle_id,
  entityReferences: optional(row.entity_references),
  entityRoster: optional(row.entity_roster),
  entityUsage: optional(row.entity_usage),
  executedNodes: optional(row.executed_nodes),
  failure: row.failure,
  gmResponse: toGmResponse(row),
  gmSummary: optional(row.gm_summary),
  gmTrace: optional(row.gm_trace),
  id: row.id,
  inventoryDelta: optional(row.inventory_delta),
  locationDelta: optional(row.location_delta),
  playerIntent: optional(row.player_intent),
  playerMessage: {
    content: row.player_message_content,
    id: row.player_message_id,
    metadata: row.player_message_metadata ?? defaultMetadata(),
    role: 'player',
  },
  playerReferenceSlugs: optional(row.player_reference_slugs),
  proseAlternates: optional(row.prose_alternates),
  proseCostUsd: optional(row.prose_cost_usd),
  referenceMentions: optional(row.reference_mentions),
  referenceUsage: optional(row.reference_usage),
  skillCheckPlan: optional(row.skill_check_plan),
  skillCheckResult: optional(row.skill_check_result),
  systemMessage: toSystemMessage(row),
  turnSequence: row.turn_sequence,
  worldContent: optional(row.world_content),
});

const turnParameters = (
  turn: Turn,
  chronicleId: string,
  sequence: number,
  chronicleState: Chronicle
): unknown[] => [
  turn.id,
  chronicleId,
  sequence,
  serializeJson(chronicleState),
  valueOr(turn.executedNodes, []),
  turn.failure,
  valueOr(turn.advancesTimeline, false),
  turn.playerMessage.id,
  turn.playerMessage.content,
  serializeJson(turn.playerMessage.metadata),
  optionalJson(turn.playerIntent),
  valueOr(turn.gmResponse?.id, null),
  valueOr(turn.gmResponse?.content, null),
  optionalJson(turn.gmResponse?.metadata),
  valueOr(turn.gmSummary, null),
  valueOr(turn.systemMessage?.id, null),
  valueOr(turn.systemMessage?.content, null),
  optionalJson(turn.systemMessage?.metadata),
  optionalJson(turn.skillCheckPlan),
  optionalJson(turn.skillCheckResult),
  optionalJson(turn.inventoryDelta),
  optionalJson(turn.locationDelta),
  optionalJson(turn.gmTrace),
  optionalJson(turn.proseAlternates),
  valueOr(turn.proseCostUsd, null),
  optionalJson(turn.entityRoster),
  optionalJson(turn.entityReferences),
  optionalJson(turn.entityUsage),
  valueOr(turn.playerReferenceSlugs, []),
  serializeJson(valueOr(turn.referenceUsage, [])),
  serializeJson(valueOr(turn.referenceMentions, [])),
  valueOr(turn.worldContent, null),
];

export class ChronicleTurnPersistence {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async commit(input: CommitTurnInput, persistChronicle: PersistChronicle): Promise<Turn> {
    const chronicleId = input.turn.chronicleId;
    if (chronicleId !== input.chronicle.id) {
      throw new Error('Turn chronicle does not match the session state chronicle.');
    }
    await withTransaction(this.#pool, async (client) => {
      const sequence = resolveTurnIndex(input.turn);
      const lastSequence = await this.#lockAndReadSequence(client, chronicleId);
      if (sequence === lastSequence) {
        await this.#assertIdempotent(client, input.turn, chronicleId);
        return;
      }
      this.#assertNextSequence(chronicleId, sequence, lastSequence);
      await persistChronicle(client, input.chronicle);
      await this.#persist(client, {
        chronicleId,
        chronicleState: input.chronicle,
        sequence,
        turn: input.turn,
      });
      await this.#updateSessionState(client, input, sequence);
    });
    return { ...input.turn, canBranch: true };
  }

  async list(chronicleId: string): Promise<Turn[]> {
    const result = await this.#pool.query<TurnRow>(
      `${TURN_SELECT} WHERE chronicle_id = $1::uuid ORDER BY turn_sequence ASC`,
      [chronicleId]
    );
    return result.rows.map(toTurn);
  }

  /**
   * A bounded slice of a chronicle's turns. With sequence bounds, the
   * inclusive range in play order; without bounds, the most recent turns.
   */
  async listWindow(input: TurnWindowInput): Promise<Turn[]> {
    const limit = Math.max(1, Math.min(50, input.limit ?? 20));
    if (input.fromSequence === undefined && input.toSequence === undefined) {
      const result = await this.#pool.query<TurnRow>(
        `${TURN_SELECT} WHERE chronicle_id = $1::uuid
         ORDER BY turn_sequence DESC LIMIT $2`,
        [input.chronicleId, limit]
      );
      return result.rows.map(toTurn).reverse();
    }
    const result = await this.#pool.query<TurnRow>(
      `${TURN_SELECT} WHERE chronicle_id = $1::uuid
       AND turn_sequence >= $2 AND turn_sequence <= $3
       ORDER BY turn_sequence ASC LIMIT $4`,
      [
        input.chronicleId,
        input.fromSequence ?? 0,
        input.toSequence ?? Number.MAX_SAFE_INTEGER,
        limit,
      ]
    );
    return result.rows.map(toTurn);
  }

  /** Full-text search over a chronicle's turn prose, best match first. */
  async search(input: TurnSearchInput): Promise<Turn[]> {
    const limit = Math.max(1, Math.min(20, input.limit ?? 5));
    const rows = await this.#searchRows(input.chronicleId, input.query, limit);
    if (rows.length > 0) {
      return rows.map(toTurn);
    }
    const orQuery = orSearchQuery(input.query);
    if (orQuery === null) {
      return [];
    }
    const fallback = await this.#searchRows(input.chronicleId, orQuery, limit);
    return fallback.map(toTurn);
  }

  async deleteForChronicle(client: PoolClient, chronicleId: string): Promise<void> {
    const turnIds = await client.query<{ id: string }>(
      'SELECT id FROM chronicle_turn WHERE chronicle_id = $1::uuid', [chronicleId]
    );
    await client.query('DELETE FROM chronicle_turn WHERE chronicle_id = $1::uuid', [chronicleId]);
    if (turnIds.rows.length > 0) {
      await client.query(
        'DELETE FROM node WHERE id = ANY($1::uuid[])',
        [turnIds.rows.map((row) => row.id)]
      );
    }
  }

  async getCheckpoint(
    client: PoolClient,
    chronicleId: string,
    turnSequence: number
  ): Promise<Chronicle | null> {
    const result = await client.query<{ chronicle_state: Chronicle | null }>(
      `SELECT chronicle_state FROM chronicle_turn
       WHERE chronicle_id = $1::uuid AND turn_sequence = $2`,
      [chronicleId, turnSequence]
    );
    const checkpoint = result.rows[0]?.chronicle_state;
    return checkpoint === null || checkpoint === undefined
      ? null
      : normalizeChronicle(checkpoint);
  }

  async copyThroughTurn(
    client: PoolClient,
    input: {
      sourceChronicleId: string;
      targetChronicle: Chronicle;
      turnSequence: number;
    }
  ): Promise<void> {
    const result = await client.query<TurnRow>(
      `${TURN_SELECT} WHERE chronicle_id = $1::uuid AND turn_sequence <= $2
       ORDER BY turn_sequence ASC`,
      [input.sourceChronicleId, input.turnSequence]
    );
    if (result.rows.at(-1)?.turn_sequence !== input.turnSequence) {
      throw new Error(`Turn ${input.turnSequence} was not found in the source chronicle.`);
    }
    const copies = result.rows.map((row) => this.#copyTurn(row, input.targetChronicle));
    await this.#persistCopies(client, copies);
  }

  #copyTurn(row: TurnRow, target: Chronicle): PersistTurnInput {
    if (row.chronicle_state === null) {
      throw new Error(`Turn ${row.turn_sequence} predates chronicle branching checkpoints.`);
    }
    return {
      chronicleId: target.id,
      chronicleState: normalizeChronicle({
        ...row.chronicle_state,
        branch: target.branch,
        characterId: target.characterId,
        id: target.id,
        playerId: target.playerId,
        status: 'open',
        summaries: [],
        targetEndTurn: undefined,
        title: target.title,
      }),
      sequence: row.turn_sequence,
      turn: {
        ...toTurn(row),
        chronicleId: target.id,
        gmTrace: undefined,
        id: randomUUID(),
      },
    };
  }

  async #searchRows(chronicleId: string, query: string, limit: number): Promise<TurnRow[]> {
    const result = await this.#pool.query<TurnRow>(
      `${TURN_SELECT}
       WHERE chronicle_id = $1::uuid
       AND search @@ websearch_to_tsquery('english', $2)
       ORDER BY ts_rank(search, websearch_to_tsquery('english', $2)) DESC LIMIT $3`,
      [chronicleId, query, limit]
    );
    return result.rows;
  }

  async #persist(client: PoolClient, input: PersistTurnInput): Promise<void> {
    await upsertNodeIdentity(client, input.turn.id, 'chronicle_turn');
    await client.query(
      TURN_INSERT,
      turnParameters(input.turn, input.chronicleId, input.sequence, input.chronicleState)
    );
  }

  async #persistCopies(client: PoolClient, copies: PersistTurnInput[]): Promise<void> {
    const [copy, ...remainingCopies] = copies;
    if (copy === undefined) {
      return;
    }
    await this.#persist(client, copy);
    return this.#persistCopies(client, remainingCopies);
  }

  async #lockAndReadSequence(client: PoolClient, chronicleId: string): Promise<number> {
    await client.query(
      `INSERT INTO chronicle_session_state (chronicle_id, last_turn_sequence)
       SELECT $1::uuid, COALESCE(MAX(turn_sequence), -1) FROM chronicle_turn
       WHERE chronicle_id = $1::uuid ON CONFLICT (chronicle_id) DO NOTHING`,
      [chronicleId]
    );
    const result = await client.query<{ last_turn_sequence: number }>(
      `SELECT last_turn_sequence FROM chronicle_session_state
       WHERE chronicle_id = $1::uuid FOR UPDATE`, [chronicleId]
    );
    return result.rows[0]?.last_turn_sequence ?? -1;
  }

  async #assertIdempotent(client: PoolClient, turn: Turn, chronicleId: string): Promise<void> {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM chronicle_turn
       WHERE chronicle_id = $1::uuid AND turn_sequence = $2`,
      [chronicleId, resolveTurnIndex(turn)]
    );
    if (existing.rows[0]?.id !== turn.id) {
      throw new Error(`Turn sequence ${turn.turnSequence} is already committed.`);
    }
  }

  #assertNextSequence(chronicleId: string, sequence: number, lastSequence: number): void {
    if (sequence !== lastSequence + 1) {
      throw new Error(
        `Turn sequence conflict for chronicle ${chronicleId}: expected ${lastSequence + 1}, received ${sequence}`
      );
    }
  }

  async #updateSessionState(
    client: PoolClient,
    input: CommitTurnInput,
    sequence: number
  ): Promise<void> {
    await client.query(
      `UPDATE chronicle_session_state SET last_turn_sequence = $2, updated_at = now()
       WHERE chronicle_id = $1::uuid`,
      [input.chronicle.id, sequence]
    );
  }
}
