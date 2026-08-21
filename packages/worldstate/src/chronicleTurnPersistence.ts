import type {
  Character,
  Chronicle,
  LocationEntity,
  SessionLocationChain,
  Turn,
} from '@glass-frontier/dto';
import type { Pool, PoolClient } from 'pg';

import { upsertNodeIdentity } from './nodeIdentity';
import { withTransaction } from './pg';

export type CommitTurnInput = {
  character: Character | null;
  chronicle: Chronicle;
  location: LocationEntity | null;
  /** Places discovered so far this chronicle; session state, never canon. */
  discoveredLocations?: SessionLocationChain;
  turn: Turn;
};

type PersistChronicle = (client: PoolClient, chronicle: Chronicle) => Promise<void>;
type TurnRow = {
  id: string;
  chronicle_id: string;
  turn_sequence: number;
  handler_id: Turn['handlerId'] | null;
  executed_nodes: Turn['executedNodes'] | null;
  failure: Turn['failure'];
  advances_timeline: Turn['advancesTimeline'] | null;
  world_delta_tags: Turn['worldDeltaTags'] | null;
  player_message_id: string;
  player_message_content: string;
  player_message_metadata: Turn['playerMessage']['metadata'] | null;
  resolved_intent_type: Turn['resolvedIntentType'] | null;
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
  beat_tracker: Turn['beatTracker'] | null;
  gm_trace: Turn['gmTrace'] | null;
  entity_offered: Turn['entityOffered'] | null;
  entity_usage: Turn['entityUsage'] | null;
};

const TURN_SELECT = `SELECT id, chronicle_id, turn_sequence,
  handler_id, executed_nodes, failure, advances_timeline, world_delta_tags,
  player_message_id, player_message_content, player_message_metadata,
  resolved_intent_type, player_intent,
  gm_response_id, gm_response_content, gm_response_metadata, gm_summary,
  system_message_id, system_message_content, system_message_metadata,
  skill_check_plan, skill_check_result, inventory_delta, location_delta,
  beat_tracker, gm_trace, entity_offered, entity_usage
  FROM chronicle_turn`;

const TURN_INSERT = `INSERT INTO chronicle_turn (
  id, chronicle_id, turn_sequence, created_at,
  handler_id, executed_nodes, failure, advances_timeline, world_delta_tags,
  player_message_id, player_message_content, player_message_metadata,
  resolved_intent_type, player_intent,
  gm_response_id, gm_response_content, gm_response_metadata, gm_summary,
  system_message_id, system_message_content, system_message_metadata,
  skill_check_plan, skill_check_result, inventory_delta, location_delta,
  beat_tracker, gm_trace, entity_offered, entity_usage
) VALUES (
  $1::uuid, $2::uuid, $3, now(), $4, $5, $6, $7, $8,
  $9, $10, $11::jsonb, $12, $13::jsonb, $14, $15, $16::jsonb, $17,
  $18, $19, $20::jsonb, $21::jsonb, $22::jsonb, $23::jsonb,
  $24::jsonb, $25::jsonb, $26::jsonb, $27::jsonb, $28::jsonb
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
  beatTracker: optional(row.beat_tracker),
  chronicleId: row.chronicle_id,
  entityOffered: optional(row.entity_offered),
  entityUsage: optional(row.entity_usage),
  executedNodes: optional(row.executed_nodes),
  failure: row.failure,
  gmResponse: toGmResponse(row),
  gmSummary: optional(row.gm_summary),
  gmTrace: optional(row.gm_trace),
  handlerId: optional(row.handler_id),
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
  resolvedIntentType: optional(row.resolved_intent_type),
  skillCheckPlan: optional(row.skill_check_plan),
  skillCheckResult: optional(row.skill_check_result),
  systemMessage: toSystemMessage(row),
  turnSequence: row.turn_sequence,
  worldDeltaTags: optional(row.world_delta_tags),
});

const turnParameters = (turn: Turn, chronicleId: string, sequence: number): unknown[] => [
  turn.id,
  chronicleId,
  sequence,
  valueOr(turn.handlerId, null),
  valueOr(turn.executedNodes, []),
  turn.failure,
  valueOr(turn.advancesTimeline, false),
  valueOr(turn.worldDeltaTags, []),
  turn.playerMessage.id,
  turn.playerMessage.content,
  serializeJson(turn.playerMessage.metadata),
  valueOr(turn.resolvedIntentType, null),
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
  optionalJson(turn.beatTracker),
  optionalJson(turn.gmTrace),
  optionalJson(turn.entityOffered),
  optionalJson(turn.entityUsage),
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
      await this.#persist(client, input.turn, chronicleId, sequence);
      await this.#updateSessionState(client, input, sequence);
    });
    return input.turn;
  }

  async list(chronicleId: string): Promise<Turn[]> {
    const result = await this.#pool.query<TurnRow>(
      `${TURN_SELECT} WHERE chronicle_id = $1::uuid ORDER BY turn_sequence ASC`,
      [chronicleId]
    );
    return result.rows.map(toTurn);
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

  async #persist(
    client: PoolClient, turn: Turn, chronicleId: string, sequence: number
  ): Promise<void> {
    await upsertNodeIdentity(client, turn.id, 'chronicle_turn');
    await client.query(TURN_INSERT, turnParameters(turn, chronicleId, sequence));
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
    client: PoolClient, input: CommitTurnInput, sequence: number
  ): Promise<void> {
    await client.query(
      `UPDATE chronicle_session_state SET character_state = $2::jsonb,
       location_state = $3::jsonb, discovered_locations = $5::jsonb,
       last_turn_sequence = $4, updated_at = now()
       WHERE chronicle_id = $1::uuid`,
      [input.chronicle.id,
        input.character === null ? null : serializeJson(input.character),
        input.location === null ? null : serializeJson(input.location), sequence,
        serializeJson(input.discoveredLocations ?? [])]
    );
  }
}
