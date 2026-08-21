import { createOpsStore, useIamAuth } from '@glass-frontier/ops';
import { log } from '@glass-frontier/utils';
import type { Pool } from 'pg';

import type { TokenUsage } from '../types';

class TokenUsageTracker {
  readonly #store: ReturnType<typeof createOpsStore>;

  constructor(options: { pool?: Pool; connectionString?: string }) {
    this.#store = createOpsStore(options);
  }

  /**
   * Create tracker from environment (local dev only).
   * For Lambda with IAM auth, use constructor with pool parameter.
   */
  static fromEnv(): TokenUsageTracker | null {
    if (useIamAuth()) {
      // In Lambda, caller must provide pool via constructor
      return null;
    }
    const connectionString = resolveConnectionString();
    if (connectionString === null) {
      return null;
    }
    return new TokenUsageTracker({ connectionString });
  }

  async record(
    playerId: string | undefined,
    usage: TokenUsage,
    timestamp = new Date()
  ): Promise<void> {
    const normalizedPlayerId = this.#normalizePlayerId(playerId);
    if (normalizedPlayerId === null) {
      return;
    }
    if (usage.inputTokens === 0 && usage.outputTokens === 0) {
      return;
    }

    await this.#store.tokenUsageStore.recordUsage({
      metrics: usage,
      playerId: normalizedPlayerId,
      timestamp,
    });
    log('info', `Updated ${normalizedPlayerId} usage data.`);
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
