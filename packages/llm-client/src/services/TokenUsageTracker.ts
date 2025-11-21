import { createOpsStore } from '@glass-frontier/ops';
import { log } from '@glass-frontier/utils';

type UsageRecord = Map<string, number>;

class TokenUsageTracker {
  readonly #store = createOpsStore({ connectionString: resolveConnectionString() ?? undefined });

  static fromEnv(): TokenUsageTracker | null {
    const connectionString = resolveConnectionString();
    if (connectionString === null) {
      return null;
    }
    return new TokenUsageTracker();
  }

  async record(
    playerId: string | undefined,
    usage: unknown,
    timestamp = new Date()
  ): Promise<void> {
    const normalizedPlayerId = this.#normalizePlayerId(playerId);
    if (normalizedPlayerId === null) {
      return;
    }
    const summary = this.#flattenUsage(usage);
    if (summary.size === 0) {
      return;
    }

    await this.#store.tokenUsageStore.recordUsage({
      metrics: Object.fromEntries(summary.entries()),
      playerId: normalizedPlayerId,
      timestamp,
    });
    log('info', `Updated ${normalizedPlayerId} usage data.`);
  }

  #flattenUsage(candidate: unknown): UsageRecord {
    if (candidate === null || typeof candidate !== 'object') {
      return new Map();
    }
    const summary: UsageRecord = new Map();
    this.#walkUsage(candidate as Record<string, unknown>, summary, []);
    return summary;
  }

  #walkUsage(value: unknown, summary: UsageRecord, path: string[]): void {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const key = path.join('_');
      if (key.length > 0) {
        const current = summary.get(key) ?? 0;
        summary.set(key, current + value);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        this.#walkUsage(entry, summary, [...path, String(index)]);
      });
      return;
    }

    if (value !== null && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        this.#walkUsage(nested, summary, [...path, key]);
      }
    }
  }

  #metricAttributeName(raw: string): string {
    const safe = raw.replace(/[^A-Za-z0-9_]+/g, '_').slice(0, 80);
    return `metric_${safe.length > 0 ? safe : 'unknown'}`;
  }

  #normalizePlayerId(playerId: string | undefined): string | null {
    if (typeof playerId !== 'string') {
      return null;
    }
    const trimmed = playerId.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

}

const resolveConnectionString = (): string | null => {
  const raw =
    process.env.GLASS_FRONTIER_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/worldstate';
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export { TokenUsageTracker };
