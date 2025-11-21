import { createOpsStore, type OpsStore } from '@glass-frontier/ops';
import { log } from '@glass-frontier/utils';
import { randomUUID } from 'node:crypto';

type ArchiveRecord = {
  id: string;
  playerId?: string;
  providerId: string;
  request: Record<string, unknown>;
  response: unknown;
  requestContextId?: string;
  nodeId?: string;
  metadata?: Record<string, unknown>;
};

export function createAuditArchive() {
  return AuditArchive.fromEnv();
}

class AuditArchive {
  readonly #store: OpsStore;

  private constructor(store: OpsStore) {
    this.#store = store;
  }

  static fromEnv(): AuditArchive | null {
    const connectionString = resolveConnectionString();
    if (connectionString === null) {
      return null;
    }
    const store = createOpsStore({ connectionString });
    return new AuditArchive(store);
  }

  async record(entry: ArchiveRecord): Promise<void> {
    const id =
      typeof entry.id === 'string' && entry.id.trim().length > 0 ? entry.id.trim() : randomUUID();

    const playerId = entry.playerId ?? undefined;
    if (!playerId) {
      log('warn', 'Skipping audit record - no playerId', { id });
      return;
    }

    const chronicleId = (entry.metadata as Record<string, unknown> | undefined)?.chronicleId;
    const characterId = (entry.metadata as Record<string, unknown> | undefined)?.characterId;
    const turnId = (entry.metadata as Record<string, unknown> | undefined)?.turnId;

    // Ensure audit group exists for this turn
    const group = await this.#store.auditGroupStore.ensureGroup({
      scopeType: typeof turnId === 'string' ? 'turn' : 'chronicle',
      scopeRef: typeof turnId === 'string' ? turnId : typeof chronicleId === 'string' ? chronicleId : undefined,
      playerId,
      chronicleId: typeof chronicleId === 'string' ? chronicleId : undefined,
      characterId: typeof characterId === 'string' ? characterId : undefined,
    });

    // Write audit entry to PostgreSQL
    await this.#store.auditLogStore.record({
      id,
      groupId: group.id,
      playerId,
      providerId: entry.providerId,
      request: entry.request,
      response: entry.response,
      metadata: entry.metadata ?? {},
      chronicleId: typeof chronicleId === 'string' ? chronicleId : undefined,
      characterId: typeof characterId === 'string' ? characterId : undefined,
      turnId: typeof turnId === 'string' ? turnId : undefined,
    });

    log('info', `Wrote ${id} to audit log.`);
  }
}

const resolveConnectionString = (): string | null => {
  const raw = process.env.GLASS_FRONTIER_DATABASE_URL ?? process.env.DATABASE_URL;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export { AuditArchive };
