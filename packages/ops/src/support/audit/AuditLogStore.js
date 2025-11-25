import { AuditLogEntrySchema } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import { createPool } from '../../pg';
const clampLimit = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 25;
    }
    return Math.min(Math.max(Math.floor(value), 5), 100);
};
const decodeCursor = (input) => {
    if (typeof input !== 'string' || input.length === 0) {
        return null;
    }
    try {
        const decoded = Buffer.from(input, 'base64url').toString('utf-8');
        const payload = JSON.parse(decoded);
        if (payload &&
            typeof payload === 'object' &&
            typeof payload.ts === 'number' &&
            typeof payload.id === 'string') {
            return { id: payload.id, ts: payload.ts };
        }
    }
    catch {
        return null;
    }
    return null;
};
const encodeCursor = (payload) => {
    const data = JSON.stringify(payload);
    return Buffer.from(data, 'utf-8').toString('base64url');
};
export class AuditLogStore {
    #pool;
    constructor(options) {
        this.#pool = createPool({
            connectionString: options?.connectionString,
            pool: options?.pool,
        });
    }
    async record(entry) {
        const now = entry.createdAt ?? new Date();
        const id = entry.id ?? randomUUID();
        await this.#pool.query(`INSERT INTO ops.audit_entry (
         id, group_id, player_id, chronicle_id, character_id, turn_id, provider_id, request, response, metadata, created_at
       ) VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6::uuid, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11)
       ON CONFLICT (id) DO NOTHING`, [
            id,
            entry.groupId,
            entry.playerId,
            entry.chronicleId ?? null,
            entry.characterId ?? null,
            entry.turnId ?? null,
            entry.providerId,
            JSON.stringify(entry.request ?? {}),
            JSON.stringify(entry.response ?? {}),
            JSON.stringify(entry.metadata ?? {}),
            now.toISOString(),
        ]);
    }
    async get(entryId) {
        const result = await this.#pool.query(`SELECT e.id, e.group_id, e.player_id, e.chronicle_id, e.character_id, e.turn_id, e.provider_id, e.request, e.response, e.metadata, e.created_at,
              g.scope_type, g.scope_ref, t.turn_sequence
       FROM ops.audit_entry e
       JOIN ops.audit_group g ON g.id = e.group_id
       LEFT JOIN chronicle_turn t ON t.id = e.turn_id
       WHERE e.id = $1::uuid`, [entryId]);
        const row = result.rows[0] ?? null;
        if (row === null) {
            return null;
        }
        return this.#mapRow(row);
    }
    async listRecent(options) {
        const limit = clampLimit(options?.limit);
        const cursor = decodeCursor(options?.cursor);
        const params = [];
        const where = [];
        if (options?.groupId) {
            params.push(options.groupId);
            where.push(`e.group_id = $${params.length}::uuid`);
        }
        if (options?.playerId) {
            params.push(options.playerId);
            where.push(`e.player_id = $${params.length}`);
        }
        if (options?.turnId) {
            params.push(options.turnId);
            where.push(`e.turn_id = $${params.length}::uuid`);
        }
        if (options?.chronicleId) {
            params.push(options.chronicleId);
            where.push(`e.chronicle_id = $${params.length}::uuid`);
        }
        if (options?.scopeType) {
            params.push(options.scopeType);
            where.push(`g.scope_type = $${params.length}`);
        }
        if (options?.scopeRef) {
            params.push(options.scopeRef);
            where.push(`g.scope_ref = $${params.length}`);
        }
        if (typeof options?.startDate === 'number') {
            params.push(new Date(options.startDate).toISOString());
            where.push(`e.created_at >= $${params.length}`);
        }
        if (typeof options?.endDate === 'number') {
            params.push(new Date(options.endDate).toISOString());
            where.push(`e.created_at <= $${params.length}`);
        }
        if (cursor) {
            params.push(new Date(cursor.ts).toISOString());
            params.push(cursor.id);
            where.push(`(e.created_at < $${params.length - 1} OR (e.created_at = $${params.length - 1} AND e.id < $${params.length}::uuid))`);
        }
        if (options?.search && options.search.trim().length > 0) {
            params.push(`%${options.search.trim().toLowerCase()}%`);
            const term = `$${params.length}`;
            where.push(`(LOWER(e.provider_id) LIKE ${term} OR LOWER(e.player_id) LIKE ${term} OR LOWER(CAST(e.request AS text)) LIKE ${term} OR LOWER(CAST(e.response AS text)) LIKE ${term})`);
        }
        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const result = await this.#pool.query(`SELECT e.id, e.group_id, e.player_id, e.chronicle_id, e.character_id, e.turn_id, e.provider_id, e.request, e.response, e.metadata, e.created_at,
              g.scope_type, g.scope_ref, t.turn_sequence
       FROM ops.audit_entry e
       JOIN ops.audit_group g ON g.id = e.group_id
       LEFT JOIN chronicle_turn t ON t.id = e.turn_id
       ${whereSql}
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT ${limit + 1}`, params);
        const rows = result.rows.slice(0, limit);
        const entries = rows
            .map((row) => this.#mapRow(row))
            .filter((entry) => entry !== null);
        const hasMore = result.rows.length > limit;
        const nextCursor = hasMore && entries.length > 0 && entries[entries.length - 1]?.entry.createdAtMs
            ? encodeCursor({
                id: entries[entries.length - 1]?.entry.id ?? '',
                ts: entries[entries.length - 1]?.entry.createdAtMs ?? 0,
            })
            : undefined;
        return { entries, nextCursor };
    }
    #mapRow(row) {
        const metadata = {
            ...(row.metadata ?? {}),
            groupId: row.group_id,
            ...(typeof row.turn_sequence === 'number' ? { turnSequence: row.turn_sequence } : {}),
        };
        const parsed = AuditLogEntrySchema.safeParse({
            characterId: row.character_id ?? undefined,
            chronicleId: row.chronicle_id ?? undefined,
            createdAt: row.created_at.toISOString(),
            createdAtMs: row.created_at.getTime(),
            id: row.id,
            metadata,
            nodeId: metadata?.nodeId,
            playerId: row.player_id,
            providerId: row.provider_id,
            request: row.request,
            requestContextId: metadata?.requestContextId,
            response: row.response,
            storageKey: row.id,
        });
        if (!parsed.success) {
            return null;
        }
        return { entry: parsed.data, groupId: row.group_id };
    }
}
