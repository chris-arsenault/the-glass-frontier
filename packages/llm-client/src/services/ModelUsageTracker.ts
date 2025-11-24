import { createOpsStore, type ModelUsageRecord } from '@glass-frontier/ops';
import { log } from '@glass-frontier/utils';

export class ModelUsageTracker {
  readonly #store = createOpsStore({ connectionString: resolveConnectionString() ?? undefined });

  static fromEnv(): ModelUsageTracker | null {
    const connectionString = resolveConnectionString();
    if (connectionString === null) {
      return null;
    }
    return new ModelUsageTracker();
  }

  async record(record: ModelUsageRecord): Promise<void> {
    try {
      await this.#store.modelUsageStore.recordUsage(record);
      log('info', `Recorded model usage for ${record.playerId}: ${record.modelId}`);
    } catch (error) {
      log('error', 'model_usage_tracker.record_failed', {
        message: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }
  }
}

const resolveConnectionString = (): string | null => {
  const raw =
    process.env.GLASS_FRONTIER_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/worldstate';
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export { type ModelUsageRecord };
