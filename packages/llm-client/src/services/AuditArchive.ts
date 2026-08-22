import { createOpsStore, useLambdaRuntime, type OpsStore } from '@glass-frontier/ops';
import { log } from '@glass-frontier/utils';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

type ArchiveRecord = {
  id: string;
  playerId?: string;
  providerId: string;
  request: Record<string, unknown>;
  response: unknown;
  requestContextId?: string;
  nodeId?: string;
  metadata?: Record<string, unknown>;
  durationMs?: number;
};

type AuditContext = {
  characterId?: string;
  chronicleId?: string;
  turnId?: string;
  scopeRef?: string;
  scopeType: 'chronicle' | 'turn';
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const extractAuditContext = (metadata?: Record<string, unknown>): AuditContext => {
  const characterId = optionalString(metadata?.characterId);
  const chronicleId = optionalString(metadata?.chronicleId);
  const turnId = optionalString(metadata?.turnId);
  return {
    characterId,
    chronicleId,
    scopeRef: turnId ?? chronicleId,
    scopeType: turnId === undefined ? 'chronicle' : 'turn',
    turnId,
  };
};

export function createAuditArchive(): AuditArchive | null {
  return AuditArchive.fromEnv();
}

class AuditArchive {
  readonly #store: OpsStore;

  constructor(options: { pool?: Pool; connectionString?: string }) {
    this.#store = createOpsStore(options);
  }

  /**
   * Create archive from environment (local dev only).
   * In Lambda, use the constructor with the shared pool parameter.
   */
  static fromEnv(): AuditArchive | null {
    if (useLambdaRuntime()) {
      // In Lambda, caller must provide pool via constructor
      return null;
    }
    const connectionString = resolveConnectionString();
    if (connectionString === null) {
      return null;
    }
    return new AuditArchive({ connectionString });
  }

  async record(entry: ArchiveRecord): Promise<void> {
    const id = entry.id.trim().length > 0 ? entry.id.trim() : randomUUID();
    const playerId = entry.playerId;
    if (playerId === undefined || playerId.length === 0) {
      log('warn', 'Skipping audit record - no playerId', { id });
      return;
    }
    const context = extractAuditContext(entry.metadata);
    const group = await this.#store.auditGroupStore.ensureGroup({
      characterId: context.characterId,
      chronicleId: context.chronicleId,
      playerId,
      scopeRef: context.scopeRef,
      scopeType: context.scopeType,
    });
    await this.#store.auditLogStore.record({
      characterId: context.characterId,
      chronicleId: context.chronicleId,
      durationMs: entry.durationMs,
      groupId: group.id,
      id,
      metadata: entry.metadata ?? {},
      playerId,
      providerId: entry.providerId,
      request: entry.request,
      response: entry.response,
      turnId: context.turnId,
    });

    log('info', `Wrote ${id} to audit log.`);
  }
}

const resolveConnectionString = (): string | null => {
  const raw = process.env.GLASS_FRONTIER_DATABASE_URL;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export { AuditArchive };
