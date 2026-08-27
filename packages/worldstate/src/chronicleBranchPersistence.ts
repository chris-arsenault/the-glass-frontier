import type { Chronicle } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import { normalizeChronicle } from './chronicleNormalization';
import type { ChronicleTurnPersistence } from './chronicleTurnPersistence';
import { withTransaction } from './pg';

export type BranchChronicleInput = {
  chronicleId: string;
  playerId: string;
  turnSequence: number;
};

type PersistChronicle = (client: PoolClient, chronicle: Chronicle) => Promise<void>;
type BranchContext = {
  root: Chronicle;
  rootChronicleId: string;
  source: Chronicle;
};

export class ChronicleBranchPersistence {
  readonly #persistChronicle: PersistChronicle;
  readonly #pool: Pool;
  readonly #turns: ChronicleTurnPersistence;

  constructor(options: {
    persistChronicle: PersistChronicle;
    pool: Pool;
    turns: ChronicleTurnPersistence;
  }) {
    this.#persistChronicle = options.persistChronicle;
    this.#pool = options.pool;
    this.#turns = options.turns;
  }

  async branch(input: BranchChronicleInput): Promise<Chronicle> {
    return withTransaction(this.#pool, async (client) => {
      const context = await this.#loadContext(client, input);
      const checkpoint = await this.#requireCheckpoint(client, context.source, input.turnSequence);
      const version = await this.#nextVersion(client, context.rootChronicleId);
      const target = this.#buildTarget(context, checkpoint, input.turnSequence, version);

      await this.#persistChronicle(client, target);
      await this.#insertSession(client, target.id, input.turnSequence);
      await this.#turns.copyThroughTurn(client, {
        sourceChronicleId: context.source.id,
        targetChronicle: target,
        turnSequence: input.turnSequence,
      });
      return target;
    });
  }

  async #loadContext(client: PoolClient, input: BranchChronicleInput): Promise<BranchContext> {
    const initialSource = await this.#readChronicle(client, input.chronicleId);
    const rootChronicleId = initialSource.branch?.rootChronicleId ?? initialSource.id;
    const root = await this.#lockChronicle(client, rootChronicleId);
    const source =
      input.chronicleId === rootChronicleId
        ? root
        : await this.#lockChronicle(client, input.chronicleId);
    this.#assertAllowed(source, input);
    return { root, rootChronicleId, source };
  }

  async #readChronicle(client: PoolClient, chronicleId: string): Promise<Chronicle> {
    const result = await client.query<{ props: Chronicle }>(
      'SELECT props FROM chronicle WHERE id = $1::uuid',
      [chronicleId]
    );
    return this.#requireChronicle(result.rows[0]?.props, chronicleId);
  }

  async #lockChronicle(client: PoolClient, chronicleId: string): Promise<Chronicle> {
    const result = await client.query<{ props: Chronicle }>(
      'SELECT props FROM chronicle WHERE id = $1::uuid FOR UPDATE',
      [chronicleId]
    );
    return this.#requireChronicle(result.rows[0]?.props, chronicleId);
  }

  #requireChronicle(props: Chronicle | undefined, chronicleId: string): Chronicle {
    if (props === undefined) {
      throw new Error(`Chronicle ${chronicleId} not found.`);
    }
    return normalizeChronicle(props);
  }

  #assertAllowed(source: Chronicle, input: BranchChronicleInput): void {
    if (source.playerId !== input.playerId) {
      throw new Error('Authenticated player does not own this chronicle.');
    }
    if (source.status !== 'open') {
      throw new Error('Only active chronicles can be branched.');
    }
    if (!Number.isInteger(input.turnSequence) || input.turnSequence < 0) {
      throw new Error('A valid turn sequence is required to branch a chronicle.');
    }
  }

  async #requireCheckpoint(
    client: PoolClient,
    source: Chronicle,
    turnSequence: number
  ): Promise<Chronicle> {
    const checkpoint = await this.#turns.getCheckpoint(client, source.id, turnSequence);
    if (checkpoint === null) {
      throw new Error(`Turn ${turnSequence} predates chronicle branching checkpoints.`);
    }
    if (checkpoint.id !== source.id) {
      throw new Error('Turn checkpoint does not belong to the source chronicle.');
    }
    return checkpoint;
  }

  async #nextVersion(client: PoolClient, rootChronicleId: string): Promise<number> {
    const result = await client.query<{ version: number }>(
      `SELECT COALESCE(MAX(
         CASE WHEN id = $1::uuid THEN 1
              ELSE (props #>> '{branch,version}')::integer END
       ), 1) + 1 AS version
       FROM chronicle
       WHERE id = $1::uuid OR props #>> '{branch,rootChronicleId}' = $2`,
      [rootChronicleId, rootChronicleId]
    );
    return result.rows[0]?.version ?? 2;
  }

  #buildTarget(
    context: BranchContext,
    checkpoint: Chronicle,
    turnSequence: number,
    version: number
  ): Chronicle {
    return normalizeChronicle({
      ...checkpoint,
      branch: {
        parentChronicleId: context.source.id,
        parentTurnSequence: turnSequence,
        rootChronicleId: context.rootChronicleId,
        version,
      },
      id: randomUUID(),
      playerId: context.source.playerId,
      status: 'open',
      summaries: [],
      targetEndTurn: undefined,
      title: `${context.root.title} v${version}`,
    });
  }

  async #insertSession(
    client: PoolClient,
    chronicleId: string,
    turnSequence: number
  ): Promise<void> {
    await client.query(
      `INSERT INTO chronicle_session_state (
         chronicle_id, last_turn_sequence, updated_at
       ) VALUES ($1::uuid, $2, now())`,
      [chronicleId, turnSequence]
    );
  }
}
