/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import type { Pool } from 'pg';

import { createPool } from '../../pg';

export type AuditGroup = {
  id: string;
  scopeType: string;
  scopeRef?: string | null;
  playerId: string;
  chronicleId?: string | null;
  characterId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type AuditGroupRow = {
  id: string;
  scope_type: string;
  scope_ref: string | null;
  player_id: string;
  chronicle_id: string | null;
  character_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

export class AuditGroupStore {
  readonly #pool: Pool;

  constructor(options?: { connectionString?: string; pool?: Pool }) {
    this.#pool = createPool({
      connectionString: options?.connectionString,
      pool: options?.pool,
    });
  }

  async ensureGroup(input: {
    scopeType: string;
    scopeRef?: string | null;
    playerId: string;
    chronicleId?: string | null;
    characterId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<AuditGroup> {
    const id = await this.#upsertGroup(input);
    const found = await this.get(id);
    if (found === null) {
      throw new Error('Failed to resolve audit group after insert.');
    }
    return found;
  }

  async get(groupId: string): Promise<AuditGroup | null> {
    const result = await this.#pool.query<AuditGroupRow>(
      `SELECT id, scope_type, scope_ref, player_id, chronicle_id, character_id, metadata, created_at, updated_at
       FROM audit_group
       WHERE id = $1::uuid`,
      [groupId]
    );
    const row = result.rows[0] ?? null;
    if (row === null) {
      return null;
    }
    return this.#mapRow(row);
  }

  async #upsertGroup(input: {
    scopeType: string;
    scopeRef?: string | null;
    playerId: string;
    chronicleId?: string | null;
    characterId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const result = await this.#pool.query<{ id: string }>(
      `INSERT INTO audit_group (scope_type, scope_ref, player_id, chronicle_id, character_id, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6::jsonb, now(), now())
       ON CONFLICT (scope_type, scope_ref, player_id) DO UPDATE
       SET chronicle_id = COALESCE(EXCLUDED.chronicle_id, audit_group.chronicle_id),
           character_id = COALESCE(EXCLUDED.character_id, audit_group.character_id),
           metadata = EXCLUDED.metadata,
           updated_at = now()
       RETURNING id`,
      [
        input.scopeType,
        input.scopeRef ?? null,
        input.playerId,
        input.chronicleId ?? null,
        input.characterId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Failed to upsert audit group.');
    }
    return row.id;
  }

  #mapRow(row: AuditGroupRow): AuditGroup {
    return {
      characterId: row.character_id,
      chronicleId: row.chronicle_id,
      createdAt: row.created_at.toISOString(),
      id: row.id,
      metadata: row.metadata ?? undefined,
      playerId: row.player_id,
      scopeRef: row.scope_ref,
      scopeType: row.scope_type,
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
