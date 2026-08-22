import type { Pool, PoolClient } from 'pg';

import { withTransaction } from '../pg';

export type LlmBudgetReservation = {
  id: string;
  period: string;
  playerId: string;
  reservedUsd: number;
};

export type LlmBudgetReservationResult =
  | { reservation: LlmBudgetReservation; status: 'reserved' }
  | { reservedUsd: number; spentUsd: number; status: 'exceeded' };

type BudgetPeriodRow = {
  spent_usd: string;
};

type ReservedTotalRow = {
  reserved_usd: string;
};

const toAmount = (value: number): string => value.toFixed(6);

export class LlmBudgetStore {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async reserve(options: {
    expiresAt: Date;
    limitUsd: number;
    period: string;
    playerId: string;
    requestedUsd: number;
    reservationId: string;
  }): Promise<LlmBudgetReservationResult> {
    const playerId = options.playerId.trim();
    this.#assertPositiveAmount(options.limitUsd, 'limitUsd');
    this.#assertPositiveAmount(options.requestedUsd, 'requestedUsd');
    if (playerId.length === 0) {
      throw new Error('playerId is required for an LLM budget reservation.');
    }

    return withTransaction(this.#pool, async (client) => {
      const spentUsd = await this.#lockPeriod(client, playerId, options.period);
      await this.#expireReservations(client, playerId, options.period);
      const reservedUsd = await this.#reservedTotal(client, playerId, options.period);
      if (spentUsd + reservedUsd + options.requestedUsd > options.limitUsd) {
        return { reservedUsd, spentUsd, status: 'exceeded' };
      }
      await this.#insertReservation(client, { ...options, playerId });
      return {
        reservation: {
          id: options.reservationId,
          period: options.period,
          playerId,
          reservedUsd: options.requestedUsd,
        },
        status: 'reserved',
      };
    });
  }

  async settle(reservation: LlmBudgetReservation, spentUsd: number): Promise<void> {
    this.#assertNonnegativeAmount(spentUsd, 'spentUsd');
    await withTransaction(this.#pool, async (client) => {
      await client.query(
        `SELECT spent_usd
         FROM ops.llm_budget_period
         WHERE player_id = $1 AND period = $2::date
         FOR UPDATE`,
        [reservation.playerId, reservation.period]
      );
      const result = await client.query(
        `UPDATE ops.llm_budget_entry
         SET reserved_usd = 0,
             spent_usd = $2::numeric,
             status = 'settled',
             updated_at = now()
         WHERE id = $1 AND status IN ('pending', 'expired')
         RETURNING id`,
        [reservation.id, toAmount(spentUsd)]
      );
      if (result.rowCount !== 1) {
        return;
      }
      await client.query(
        `UPDATE ops.llm_budget_period
         SET spent_usd = spent_usd + $3::numeric, updated_at = now()
         WHERE player_id = $1 AND period = $2::date`,
        [reservation.playerId, reservation.period, toAmount(spentUsd)]
      );
    });
  }

  async release(reservation: LlmBudgetReservation): Promise<void> {
    await this.#pool.query(
      `UPDATE ops.llm_budget_entry
       SET reserved_usd = 0, status = 'released', updated_at = now()
       WHERE id = $1 AND status IN ('pending', 'expired')`,
      [reservation.id]
    );
  }

  async #lockPeriod(client: PoolClient, playerId: string, period: string): Promise<number> {
    await client.query(
      `INSERT INTO ops.llm_budget_period (player_id, period)
       VALUES ($1, $2::date)
       ON CONFLICT (player_id, period) DO NOTHING`,
      [playerId, period]
    );
    const result = await client.query<BudgetPeriodRow>(
      `SELECT spent_usd::text
       FROM ops.llm_budget_period
       WHERE player_id = $1 AND period = $2::date
       FOR UPDATE`,
      [playerId, period]
    );
    return Number(result.rows[0]?.spent_usd ?? 0);
  }

  async #expireReservations(client: PoolClient, playerId: string, period: string): Promise<void> {
    // Keep an expired reservation held: the process may have stopped after the
    // provider charged the request but before settlement reached PostgreSQL.
    await client.query(
      `UPDATE ops.llm_budget_entry
       SET status = 'expired', updated_at = now()
       WHERE player_id = $1
         AND period = $2::date
         AND status = 'pending'
         AND expires_at <= now()`,
      [playerId, period]
    );
  }

  async #reservedTotal(client: PoolClient, playerId: string, period: string): Promise<number> {
    const result = await client.query<ReservedTotalRow>(
      `SELECT COALESCE(SUM(reserved_usd), 0)::text AS reserved_usd
       FROM ops.llm_budget_entry
       WHERE player_id = $1
         AND period = $2::date
         AND status IN ('pending', 'expired')`,
      [playerId, period]
    );
    return Number(result.rows[0]?.reserved_usd ?? 0);
  }

  async #insertReservation(
    client: PoolClient,
    options: {
      expiresAt: Date;
      period: string;
      playerId: string;
      requestedUsd: number;
      reservationId: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO ops.llm_budget_entry
         (id, player_id, period, reserved_usd, spent_usd, status, expires_at)
       VALUES ($1, $2, $3::date, $4::numeric, 0, 'pending', $5)`,
      [
        options.reservationId,
        options.playerId,
        options.period,
        toAmount(options.requestedUsd),
        options.expiresAt.toISOString(),
      ]
    );
  }

  #assertPositiveAmount(value: number, name: string): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a positive finite number.`);
    }
  }

  #assertNonnegativeAmount(value: number, name: string): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${name} must be a nonnegative finite number.`);
    }
  }
}
