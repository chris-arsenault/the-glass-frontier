import { createPool } from '../../pg';
export class AuditGroupStore {
    #pool;
    constructor(options) {
        this.#pool = createPool({
            connectionString: options?.connectionString,
            pool: options?.pool,
        });
    }
    async ensureGroup(input) {
        const id = await this.#upsertGroup(input);
        const found = await this.get(id);
        if (found === null) {
            throw new Error('Failed to resolve audit group after insert.');
        }
        return found;
    }
    async get(groupId) {
        const result = await this.#pool.query(`SELECT id, scope_type, scope_ref, player_id, chronicle_id, character_id, metadata, created_at, updated_at
       FROM ops.audit_group
       WHERE id = $1::uuid`, [groupId]);
        const row = result.rows[0] ?? null;
        if (row === null) {
            return null;
        }
        return this.#mapRow(row);
    }
    async #upsertGroup(input) {
        const result = await this.#pool.query(`INSERT INTO ops.audit_group (scope_type, scope_ref, player_id, chronicle_id, character_id, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6::jsonb, now(), now())
       ON CONFLICT (scope_type, scope_ref, player_id) DO UPDATE
       SET chronicle_id = COALESCE(EXCLUDED.chronicle_id, ops.audit_group.chronicle_id),
           character_id = COALESCE(EXCLUDED.character_id, ops.audit_group.character_id),
           metadata = EXCLUDED.metadata,
           updated_at = now()
       RETURNING id`, [
            input.scopeType,
            input.scopeRef ?? null,
            input.playerId,
            input.chronicleId ?? null,
            input.characterId ?? null,
            JSON.stringify(input.metadata ?? {}),
        ]);
        const row = result.rows[0];
        if (row === undefined) {
            throw new Error('Failed to upsert audit group.');
        }
        return row.id;
    }
    #mapRow(row) {
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
