import { TokenUsagePeriodSchema } from '@glass-frontier/dto';
import { createPool, withTransaction } from '../pg';
export class TokenUsageStore {
    #pool;
    constructor(options) {
        this.#pool = createPool({
            connectionString: options.connectionString,
            pool: options.pool,
        });
    }
    async listUsage(playerId, limit = 6) {
        const trimmedPlayer = playerId.trim();
        if (trimmedPlayer.length === 0) {
            return [];
        }
        const cappedLimit = Math.min(Math.max(limit, 1), 24);
        const result = await this.#pool.query(`SELECT usage_period, total_requests, metrics, updated_at
       FROM ops.token_usage
       WHERE player_id = $1
       ORDER BY usage_period DESC
       LIMIT $2`, [trimmedPlayer, cappedLimit]);
        return result.rows
            .map((row) => this.#mapRow(row))
            .filter((entry) => entry !== null);
    }
    async recordUsage(options) {
        const playerId = options.playerId.trim();
        if (playerId.length === 0) {
            return;
        }
        const timestamp = options.timestamp ?? new Date();
        const usagePeriod = this.#usagePeriod(timestamp);
        const nextMetrics = this.#normalizeMetrics(options.metrics);
        await withTransaction(this.#pool, async (client) => {
            const existing = await client.query('SELECT metrics, total_requests FROM ops.token_usage WHERE player_id = $1 AND usage_period = $2 FOR UPDATE', [playerId, usagePeriod]);
            const currentMetrics = this.#normalizeMetrics(existing.rows[0]?.metrics ?? {});
            const mergedMetrics = this.#mergeMetrics(currentMetrics, nextMetrics);
            const totalRequests = (existing.rows[0]?.total_requests ?? 0) + 1;
            if (existing.rowCount === 0) {
                await client.query(`INSERT INTO ops.token_usage (player_id, usage_period, total_requests, metrics, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, $5)`, [playerId, usagePeriod, totalRequests, JSON.stringify(mergedMetrics), timestamp.toISOString()]);
                return;
            }
            await client.query(`UPDATE ops.token_usage
         SET total_requests = $3,
             metrics = $4::jsonb,
             updated_at = $5
         WHERE player_id = $1 AND usage_period = $2`, [playerId, usagePeriod, totalRequests, JSON.stringify(mergedMetrics), timestamp.toISOString()]);
        });
    }
    #mapRow(row) {
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
    #extractMetrics(raw) {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
            return [];
        }
        const metrics = [];
        for (const [key, value] of Object.entries(raw)) {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                continue;
            }
            metrics.push({
                key: this.#normalizeMetricKey(key),
                value,
            });
        }
        metrics.sort((a, b) => b.value === a.value ? a.key.localeCompare(b.key) : b.value - a.value);
        return metrics;
    }
    #normalizeMetricKey(key) {
        return key.replace(/^metric[_-]?/, '');
    }
    #mergeMetrics(current, next) {
        const merged = new Map();
        for (const [key, value] of Object.entries(current)) {
            merged.set(key, value);
        }
        for (const [key, value] of Object.entries(next)) {
            const base = merged.get(key) ?? 0;
            merged.set(key, base + value);
        }
        return Object.fromEntries(merged);
    }
    #normalizeMetrics(input) {
        const normalized = new Map();
        for (const [key, value] of Object.entries(input)) {
            if (typeof value === 'number' && Number.isFinite(value)) {
                normalized.set(key, value);
            }
        }
        return Object.fromEntries(normalized);
    }
    #normalizePeriod(input) {
        if (typeof input !== 'string') {
            return null;
        }
        const trimmed = input.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    #usagePeriod(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }
}
