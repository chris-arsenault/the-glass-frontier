/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import type { TokenUsageMetric, TokenUsagePeriod } from '@glass-frontier/dto';
import { TokenUsagePeriodSchema } from '@glass-frontier/dto';
import type { Pool } from 'pg';

import { createPool, withTransaction } from '../pg';

type TokenUsageStoreOptions = {
  connectionString?: string;
  pool?: Pool;
};

type TokenUsageRow = {
  usage_period: string;
  total_requests: number | null;
  metrics: Record<string, unknown> | null;
  updated_at: Date | null;
};

export class TokenUsageStore {
  readonly #pool: Pool;

  constructor(options: TokenUsageStoreOptions) {
    this.#pool = createPool({
      connectionString: options.connectionString,
      pool: options.pool,
    });
  }

  async listUsage(playerId: string, limit = 6): Promise<TokenUsagePeriod[]> {
    const trimmedPlayer = playerId.trim();
    if (trimmedPlayer.length === 0) {
      return [];
    }
    const cappedLimit = Math.min(Math.max(limit, 1), 24);
    const result = await this.#pool.query<TokenUsageRow>(
      `SELECT usage_period, total_requests, metrics, updated_at
       FROM token_usage
       WHERE player_id = $1
       ORDER BY usage_period DESC
       LIMIT $2`,
      [trimmedPlayer, cappedLimit]
    );
    return result.rows
      .map((row) => this.#mapRow(row))
      .filter((entry): entry is TokenUsagePeriod => entry !== null);
  }

  async recordUsage(options: {
    playerId: string;
    metrics: Record<string, number>;
    timestamp?: Date;
  }): Promise<void> {
    const playerId = options.playerId.trim();
    if (playerId.length === 0) {
      return;
    }
    const timestamp = options.timestamp ?? new Date();
    const usagePeriod = this.#usagePeriod(timestamp);
    const nextMetrics = this.#normalizeMetrics(options.metrics);

    await withTransaction(this.#pool, async (client) => {
      const existing = await client.query<TokenUsageRow>(
        'SELECT metrics, total_requests FROM token_usage WHERE player_id = $1 AND usage_period = $2 FOR UPDATE',
        [playerId, usagePeriod]
      );
      const currentMetrics = this.#normalizeMetrics(existing.rows[0]?.metrics ?? {});
      const mergedMetrics = this.#mergeMetrics(currentMetrics, nextMetrics);
      const totalRequests = (existing.rows[0]?.total_requests ?? 0) + 1;

      if (existing.rowCount === 0) {
        await client.query(
          `INSERT INTO token_usage (player_id, usage_period, total_requests, metrics, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, $5)`,
          [playerId, usagePeriod, totalRequests, JSON.stringify(mergedMetrics), timestamp.toISOString()]
        );
        return;
      }
      await client.query(
        `UPDATE token_usage
         SET total_requests = $3,
             metrics = $4::jsonb,
             updated_at = $5
         WHERE player_id = $1 AND usage_period = $2`,
        [playerId, usagePeriod, totalRequests, JSON.stringify(mergedMetrics), timestamp.toISOString()]
      );
    });
  }

  #mapRow(row: TokenUsageRow): TokenUsagePeriod | null {
    const period = this.#normalizePeriod(row.usage_period);
    if (period === null) {
      return null;
    }
    const totalRequests = typeof row.total_requests === 'number' ? row.total_requests : 0;
    const updatedAt = row.updated_at?.toISOString() ?? null;
    const metrics = this.#extractMetrics(row.metrics);
    const parsed = TokenUsagePeriodSchema.safeParse({
      metrics,
      period,
      totalRequests,
      updatedAt,
    });
    return parsed.success ? parsed.data : null;
  }

  #extractMetrics(raw: Record<string, unknown> | null): TokenUsageMetric[] {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return [];
    }
    const metrics: TokenUsageMetric[] = [];
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        continue;
      }
      metrics.push({
        key: this.#normalizeMetricKey(key),
        value,
      });
    }
    metrics.sort((a, b) =>
      b.value === a.value ? a.key.localeCompare(b.key) : b.value - a.value
    );
    return metrics;
  }

  #normalizeMetricKey(key: string): string {
    return key.replace(/^metric[_-]?/, '');
  }

  #mergeMetrics(
    current: Record<string, number>,
    next: Record<string, number>
  ): Record<string, number> {
    const merged = new Map<string, number>();
    for (const [key, value] of Object.entries(current)) {
      merged.set(key, value);
    }
    for (const [key, value] of Object.entries(next)) {
      const base = merged.get(key) ?? 0;
      merged.set(key, base + value);
    }
    return Object.fromEntries(merged);
  }

  #normalizeMetrics(input: Record<string, unknown>): Record<string, number> {
    const normalized = new Map<string, number>();
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        normalized.set(key, value);
      }
    }
    return Object.fromEntries(normalized);
  }

  #normalizePeriod(input?: string): string | null {
    if (typeof input !== 'string') {
      return null;
    }
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  #usagePeriod(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
}
