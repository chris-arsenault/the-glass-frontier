import { randomUUID } from 'node:crypto';
import { GraphOperations } from './graphOperations';
import { createPool, withTransaction } from './pg';
import { normalizeTags, now, toSnakeCase } from './utils';
const toHardState = (row, links) => ({
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    subkind: row.subkind ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    prominence: row.prominence ?? 'recognized',
    status: row.status ?? undefined,
    links,
    createdAt: row.created_at?.getTime() ?? now(),
    updatedAt: row.updated_at?.getTime() ?? now(),
});
const toLoreFragment = (row) => ({
    id: row.id,
    entityId: row.entity_id,
    source: {
        chronicleId: row.chronicle_id ?? undefined,
        beatId: row.beat_id ?? undefined,
        entityKind: row.entity_kind,
    },
    title: row.title,
    prose: row.prose,
    tags: Array.isArray(row.tags) ? row.tags : [],
    timestamp: row.created_at?.getTime() ?? now(),
});
// Removed: toLocationEntity - no longer needed
const PROMINENCE_RANK = {
    forgotten: 0,
    marginal: 1,
    recognized: 2,
    renowned: 3,
    mythic: 4,
};
class PostgresWorldSchemaStore {
    #pool;
    #graph;
    constructor(options) {
        this.#pool = options.pool;
        this.#graph = options.graph ?? new GraphOperations(options.pool);
    }
    async upsertEntity(input) {
        const id = input.id ?? randomUUID();
        const normalizedLinks = this.#sanitizeLinks(input.links);
        const description = input.description?.trim() ?? null;
        await withTransaction(this.#pool, async (client) => {
            const kindRow = await this.#getKind(client, input.kind);
            const status = await this.#resolveStatus(client, input.kind, input.status ?? kindRow.default_status);
            await this.#assertSubkind(client, input.kind, input.subkind ?? null);
            const prominence = input.prominence ?? 'recognized';
            await this.#assertProminence(prominence);
            const slug = await this.#reserveSlug(client, toSnakeCase(input.name), id);
            const subkind = input.subkind ?? null;
            await this.#graph.upsertNode(client, id, 'world_entity', {
                id,
                slug,
                kind: input.kind,
                subkind: subkind ?? undefined,
                name: input.name,
                description: description ?? undefined,
                prominence,
                status: status ?? undefined,
                links: normalizedLinks,
            });
            await client.query(`INSERT INTO hard_state (id, slug, kind, subkind, name, description, prominence, status, created_at, updated_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, now(), now())
         ON CONFLICT (id) DO UPDATE
         SET slug = EXCLUDED.slug,
             kind = EXCLUDED.kind,
             subkind = EXCLUDED.subkind,
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             prominence = EXCLUDED.prominence,
             status = EXCLUDED.status,
             updated_at = now()`, [id, slug, input.kind, subkind, input.name, input.description ?? null, prominence, status ?? null]);
            if (input.links) {
                await this.#syncRelationships(client, id, normalizedLinks);
            }
        });
        const persisted = await this.getEntity({ id });
        if (!persisted) {
            throw new Error('Failed to upsert entity');
        }
        return persisted;
    }
    async deleteEntity(input) {
        await withTransaction(this.#pool, async (client) => {
            await client.query(`DELETE FROM edge
         WHERE type IN (SELECT id FROM world_relationship_kind)
           AND (src_id = $1::uuid OR dst_id = $1::uuid)`, [input.id]);
            await client.query('DELETE FROM hard_state WHERE id = $1::uuid', [input.id]);
            await this.#graph.deleteNode(client, input.id);
        });
    }
    async upsertRelationship(input) {
        await withTransaction(this.#pool, async (client) => {
            await this.#assertRelationshipAllowed(client, input.relationship, input.srcId, input.dstId);
            await this.#graph.upsertEdge(client, {
                src: input.srcId,
                dst: input.dstId,
                type: input.relationship,
                props: {},
            });
        });
    }
    async deleteRelationship(input) {
        await this.#pool.query(`DELETE FROM edge WHERE src_id = $1::uuid AND dst_id = $2::uuid AND type = $3`, [input.srcId, input.dstId, input.relationship]);
    }
    async getEntity(input) {
        const result = await this.#pool.query(`SELECT hs.id, hs.slug, hs.kind, hs.subkind, hs.name, hs.description, hs.prominence, hs.status, hs.created_at, hs.updated_at, wp.rank as prominence_rank
       FROM hard_state hs
       JOIN world_prominence wp ON wp.id = hs.prominence
       WHERE hs.id = $1::uuid`, [input.id]);
        const row = result.rows[0];
        if (!row) {
            return null;
        }
        const links = await this.#listLinks(row.id);
        return toHardState(row, links);
    }
    async listEntities(input) {
        const limit = Math.max(1, Math.min(200, input?.limit ?? 100));
        const params = [limit];
        const clauses = [];
        if (input?.kind) {
            params.push(input.kind);
            clauses.push(`hs.kind = $${params.length}`);
        }
        const mapOrder = (value) => ['forgotten', 'marginal', 'recognized', 'renowned', 'mythic'].indexOf(value);
        if (input?.minProminence) {
            params.push(mapOrder(input.minProminence));
            clauses.push(`wp.rank >= $${params.length}`);
        }
        if (input?.maxProminence) {
            params.push(mapOrder(input.maxProminence));
            clauses.push(`wp.rank <= $${params.length}`);
        }
        const filter = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const result = await this.#pool.query(`SELECT hs.id, hs.slug, hs.kind, hs.subkind, hs.name, hs.description, hs.prominence, hs.status, hs.created_at, hs.updated_at, wp.rank as prominence_rank
       FROM hard_state hs
       JOIN world_prominence wp ON wp.id = hs.prominence
       ${filter}
       ORDER BY wp.rank ASC, hs.created_at ASC
       LIMIT $1`, params);
        const ids = result.rows.map((row) => row.id);
        const linkLookup = await this.#listLinksForMany(ids);
        return result.rows.map((row) => toHardState(row, linkLookup.get(row.id) ?? []));
    }
    async getEntityBySlug(input) {
        const result = await this.#pool.query(`SELECT hs.id, hs.slug, hs.kind, hs.subkind, hs.name, hs.description, hs.prominence, hs.status, hs.created_at, hs.updated_at, wp.rank as prominence_rank
       FROM hard_state hs
       JOIN world_prominence wp ON wp.id = hs.prominence
       WHERE hs.slug = $1`, [input.slug]);
        const row = result.rows[0];
        if (!row) {
            return null;
        }
        const links = await this.#listLinks(row.id);
        return toHardState(row, links);
    }
    async listNeighbors(input) {
        return this.#listNeighbors({
            anchorId: input.id,
            kind: input.kind,
            minProminence: input.minProminence ?? 'recognized',
            maxProminence: input.maxProminence,
            maxHops: input.maxHops ?? 2,
            limit: input.limit,
        });
    }
    async createLoreFragment(input) {
        const id = input.id ?? randomUUID();
        const timestamp = input.timestamp ?? now();
        const tags = normalizeTags(input.tags, 24);
        await withTransaction(this.#pool, async (client) => {
            await this.#assertHardStatesExist(client, input.entityId);
            await this.#graph.upsertNode(client, id, 'lore_fragment', {
                id,
                entityId: input.entityId,
                source: input.source,
                title: input.title,
                prose: input.prose,
                tags,
                timestamp,
            });
            await client.query(`INSERT INTO lore_fragment (
           id, entity_id, chronicle_id, beat_id,
           title, prose, tags, created_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4,
           $5, $6, $7::text[], to_timestamp($8 / 1000.0)
         )`, [
                id,
                input.entityId,
                input.source.chronicleId ?? null,
                input.source.beatId ?? null,
                input.title,
                input.prose,
                tags,
                timestamp,
            ]);
        });
        const fragment = await this.getLoreFragment({ id });
        if (!fragment) {
            throw new Error('Failed to create lore fragment');
        }
        return fragment;
    }
    async getWorldSchema() {
        const kinds = await this.#pool.query(`SELECT id, category, display_name, default_status
       FROM world_kind
       ORDER BY id ASC`);
        const subkinds = await this.#pool.query(`SELECT id, kind_id FROM world_subkind`);
        const statuses = await this.#pool.query(`SELECT status, kind_id FROM world_kind_status`);
        const relationshipTypes = await this.#pool.query(`SELECT id, description FROM world_relationship_kind ORDER BY id ASC`);
        const relationshipRules = await this.#pool.query(`SELECT relationship_id, src_kind, dst_kind FROM world_relationship_rule ORDER BY relationship_id ASC`);
        const kindsById = new Map();
        for (const row of kinds.rows) {
            kindsById.set(row.id, {
                id: row.id,
                category: row.category ?? undefined,
                displayName: row.display_name ?? undefined,
                defaultStatus: row.default_status ?? undefined,
                subkinds: [],
                statuses: [],
            });
        }
        for (const row of subkinds.rows) {
            const target = kindsById.get(row.kind_id);
            if (target) {
                target.subkinds.push(row.id);
            }
        }
        for (const row of statuses.rows) {
            const target = kindsById.get(row.kind_id);
            if (target) {
                target.statuses.push(row.status);
            }
        }
        return {
            kinds: Array.from(kindsById.values()),
            relationshipTypes: relationshipTypes.rows.map((row) => ({
                id: row.id,
                description: row.description ?? undefined,
            })),
            relationshipRules: relationshipRules.rows.map((row) => ({
                relationshipId: row.relationship_id,
                srcKind: row.src_kind,
                dstKind: row.dst_kind,
            })),
        };
    }
    async upsertKind(input) {
        await withTransaction(this.#pool, async (client) => {
            await client.query(`INSERT INTO world_kind (id, category, display_name, default_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())
         ON CONFLICT (id) DO UPDATE
         SET category = EXCLUDED.category,
             display_name = EXCLUDED.display_name,
             default_status = EXCLUDED.default_status,
             updated_at = now()`, [input.id, input.category ?? null, input.displayName ?? null, input.defaultStatus ?? null]);
            if (input.subkinds) {
                await client.query(`DELETE FROM world_subkind WHERE kind_id = $1`, [input.id]);
                for (const subkind of input.subkinds) {
                    await client.query(`INSERT INTO world_subkind (id, kind_id, created_at)
             VALUES ($1, $2, now())`, [subkind, input.id]);
                }
            }
            if (input.statuses) {
                await client.query(`DELETE FROM world_kind_status WHERE kind_id = $1`, [input.id]);
                for (const status of input.statuses) {
                    await client.query(`INSERT INTO world_kind_status (kind_id, status)
             VALUES ($1, $2)`, [input.id, status]);
                }
            }
        });
        const schema = await this.getWorldSchema();
        const next = schema.kinds.find((kind) => kind.id === input.id);
        if (!next) {
            throw new Error('Failed to upsert kind');
        }
        return next;
    }
    async addRelationshipType(input) {
        await this.#pool.query(`INSERT INTO world_relationship_kind (id, description)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description`, [input.id, input.description ?? null]);
        return { id: input.id, description: input.description ?? undefined };
    }
    async upsertRelationshipRule(input) {
        await withTransaction(this.#pool, async (client) => {
            await this.#assertRelationshipTypeExists(client, input.relationshipId);
            await this.#assertKind(client, input.srcKind);
            await this.#assertKind(client, input.dstKind);
            await client.query(`INSERT INTO world_relationship_rule (relationship_id, src_kind, dst_kind)
         VALUES ($1, $2, $3)
         ON CONFLICT ON CONSTRAINT world_relationship_rule_pk DO NOTHING`, [input.relationshipId, input.srcKind, input.dstKind]);
        });
    }
    async deleteRelationshipRule(input) {
        await this.#pool.query(`DELETE FROM world_relationship_rule
       WHERE relationship_id = $1 AND src_kind = $2 AND dst_kind = $3`, [input.relationshipId, input.srcKind, input.dstKind]);
    }
    async getLoreFragment(input) {
        const result = await this.#pool.query(`SELECT lf.*, hs.kind as entity_kind
       FROM lore_fragment lf
       JOIN hard_state hs ON hs.id = lf.entity_id
       WHERE lf.id = $1::uuid`, [input.id]);
        const row = result.rows[0];
        if (!row) {
            return null;
        }
        return toLoreFragment(row);
    }
    async listLoreFragmentsByEntity(input) {
        const limit = Math.max(1, Math.min(200, input.limit ?? 50));
        const result = await this.#pool.query(`SELECT lf.*, hs.kind as entity_kind
       FROM lore_fragment lf
       JOIN hard_state hs ON hs.id = lf.entity_id
       WHERE lf.entity_id = $1::uuid
       ORDER BY lf.created_at ASC
       LIMIT $2`, [input.entityId, limit]);
        return result.rows.map((row) => toLoreFragment(row));
    }
    async updateLoreFragment(input) {
        const fragment = await this.getLoreFragment({ id: input.id });
        if (!fragment) {
            throw new Error('Lore fragment not found');
        }
        const nextTags = input.tags ? normalizeTags(input.tags, 24) : fragment.tags;
        const nextSource = {
            chronicleId: input.source?.chronicleId ?? fragment.source.chronicleId,
            beatId: input.source?.beatId ?? fragment.source.beatId,
        };
        await withTransaction(this.#pool, async (client) => {
            await this.#graph.upsertNode(client, input.id, 'lore_fragment', {
                ...fragment,
                title: input.title ?? fragment.title,
                prose: input.prose ?? fragment.prose,
                tags: nextTags,
                source: nextSource,
            });
            await client.query(`UPDATE lore_fragment
         SET title = $1,
             prose = $2,
             tags = $3::text[],
             beat_id = $4,
             chronicle_id = $5::uuid
         WHERE id = $6::uuid`, [
                input.title ?? fragment.title,
                input.prose ?? fragment.prose,
                nextTags,
                nextSource.beatId ?? null,
                nextSource.chronicleId ?? null,
                input.id,
            ]);
        });
        const updated = await this.getLoreFragment({ id: input.id });
        if (!updated) {
            throw new Error('Failed to update lore fragment');
        }
        return updated;
    }
    async deleteLoreFragment(input) {
        await withTransaction(this.#pool, async (client) => {
            await client.query('DELETE FROM lore_fragment WHERE id = $1::uuid', [input.id]);
            await this.#graph.deleteNode(client, input.id);
        });
    }
    async #getKind(executor, kind) {
        const result = await executor.query(`SELECT id, category, display_name, default_status
       FROM world_kind
       WHERE id = $1`, [kind]);
        const row = result.rows[0];
        if (!row) {
            throw new Error(`Hard state kind ${kind} is not configured`);
        }
        return row;
    }
    async #resolveStatus(executor, kind, status) {
        if (status === null) {
            return null;
        }
        const result = await executor.query(`SELECT 1 FROM world_kind_status WHERE kind_id = $1 AND status = $2`, [kind, status]);
        if (!result.rowCount) {
            throw new Error(`Status ${status} is not allowed for kind ${kind}`);
        }
        return status;
    }
    async #assertSubkind(executor, kind, subkind) {
        if (!subkind) {
            return;
        }
        const result = await executor.query(`SELECT 1 FROM world_subkind WHERE id = $1 AND kind_id = $2`, [subkind, kind]);
        if (!result.rowCount) {
            throw new Error(`Subkind ${subkind} is not allowed for kind ${kind}`);
        }
    }
    async #assertRelationshipTypeExists(executor, relationshipId) {
        const result = await executor.query(`SELECT 1 FROM world_relationship_kind WHERE id = $1`, [relationshipId]);
        if (!result.rowCount) {
            throw new Error(`Relationship type ${relationshipId} is not configured`);
        }
    }
    async #assertProminence(value) {
        const result = await this.#pool.query(`SELECT 1 FROM world_prominence WHERE id = $1`, [value]);
        if (!result.rowCount) {
            throw new Error(`Invalid prominence value: ${value}`);
        }
    }
    async #assertKind(executor, kind) {
        const result = await executor.query(`SELECT 1 FROM world_kind WHERE id = $1`, [kind]);
        if (!result.rowCount) {
            throw new Error(`Hard state kind ${kind} is not configured`);
        }
    }
    async #syncRelationships(executor, entityId, links) {
        await executor.query(`DELETE FROM edge
       WHERE type IN (SELECT id FROM world_relationship_kind)
         AND (src_id = $1::uuid OR dst_id = $1::uuid)`, [entityId]);
        for (const link of links) {
            await this.#assertRelationshipAllowed(executor, link.relationship, entityId, link.targetId);
            await this.#graph.upsertEdge(executor, {
                src: entityId,
                dst: link.targetId,
                type: link.relationship,
                props: {},
            });
        }
    }
    async #assertRelationshipAllowed(executor, relationship, srcId, dstId) {
        const kinds = await executor.query(`SELECT id, kind FROM hard_state WHERE id = ANY($1::uuid[])`, [[srcId, dstId]]);
        if (kinds.rowCount !== 2) {
            throw new Error('Relationship targets must both be hard state entities');
        }
        const srcKind = kinds.rows.find((row) => row.id === srcId)?.kind;
        const dstKind = kinds.rows.find((row) => row.id === dstId)?.kind;
        if (!srcKind || !dstKind) {
            throw new Error('Unable to resolve kinds for relationship endpoints');
        }
        const rule = await executor.query(`SELECT 1
       FROM world_relationship_rule
       WHERE relationship_id = $1 AND src_kind = $2 AND dst_kind = $3`, [relationship, srcKind, dstKind]);
        if (!rule.rowCount) {
            throw new Error(`Relationship ${relationship} is not allowed between ${srcKind} and ${dstKind}`);
        }
    }
    async #assertHardStatesExist(executor, ...entityIds) {
        if (entityIds.length === 0) {
            return;
        }
        const unique = Array.from(new Set(entityIds));
        const result = await executor.query(`SELECT id FROM hard_state WHERE id = ANY($1::uuid[])`, [unique]);
        if (result.rowCount !== unique.length) {
            throw new Error('One or more hard state entities do not exist');
        }
    }
    #sanitizeLinks(links) {
        if (!Array.isArray(links)) {
            return [];
        }
        const unique = new Map();
        for (const link of links) {
            if (!link || typeof link.relationship !== 'string' || typeof link.targetId !== 'string') {
                continue;
            }
            const trimmedRelationship = link.relationship.trim();
            const trimmedTarget = link.targetId.trim();
            if (!trimmedRelationship || !trimmedTarget) {
                continue;
            }
            unique.set(`${trimmedRelationship}:${trimmedTarget}`, {
                relationship: trimmedRelationship,
                targetId: trimmedTarget,
            });
        }
        return Array.from(unique.values());
    }
    async #listLinks(entityId) {
        const result = await this.#pool.query(`SELECT e.src_id, e.dst_id, e.type
       FROM edge e
       WHERE e.type IN (SELECT id FROM world_relationship_kind)
         AND (e.src_id = $1::uuid OR e.dst_id = $1::uuid)`, [entityId]);
        const links = [];
        for (const row of result.rows) {
            if (row.src_id === entityId) {
                links.push({ relationship: row.type, targetId: row.dst_id, direction: 'out' });
            }
            else {
                links.push({ relationship: row.type, targetId: row.src_id, direction: 'in' });
            }
        }
        return links;
    }
    async #listLinksForMany(entityIds) {
        const linkMap = new Map();
        if (entityIds.length === 0) {
            return linkMap;
        }
        const idSet = new Set(entityIds);
        const result = await this.#pool.query(`SELECT e.src_id, e.dst_id, e.type
       FROM edge e
       WHERE e.type IN (SELECT id FROM world_relationship_kind)
         AND (e.src_id = ANY($1::uuid[]) OR e.dst_id = ANY($1::uuid[]))`, [entityIds]);
        for (const row of result.rows) {
            if (idSet.has(row.src_id)) {
                const current = linkMap.get(row.src_id) ?? [];
                current.push({ relationship: row.type, targetId: row.dst_id, direction: 'out' });
                linkMap.set(row.src_id, current);
            }
            if (idSet.has(row.dst_id)) {
                const current = linkMap.get(row.dst_id) ?? [];
                current.push({ relationship: row.type, targetId: row.src_id, direction: 'in' });
                linkMap.set(row.dst_id, current);
            }
        }
        return linkMap;
    }
    async #listNeighbors(input) {
        const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
        const maxHops = Math.max(1, Math.min(input.maxHops ?? 2, 2));
        const minRank = PROMINENCE_RANK[input.minProminence] ?? PROMINENCE_RANK.recognized;
        const maxRank = input.maxProminence ? PROMINENCE_RANK[input.maxProminence] : Number.MAX_SAFE_INTEGER;
        const kindFilter = input.kind ?? null;
        const result = await this.#pool.query(`WITH base AS (
         SELECT
           CASE WHEN e.src_id = $1::uuid THEN e.dst_id ELSE e.src_id END AS neighbor_id,
           e.type AS root_relationship,
           CASE WHEN e.src_id = $1::uuid THEN 'out' ELSE 'in' END AS root_direction
         FROM edge e
         JOIN hard_state hs ON hs.id = CASE WHEN e.src_id = $1::uuid THEN e.dst_id ELSE e.src_id END
         JOIN world_prominence wp ON wp.id = hs.prominence
         WHERE (e.src_id = $1::uuid OR e.dst_id = $1::uuid)
           AND wp.rank >= $2 AND wp.rank <= $3
           AND ($4::text IS NULL OR hs.kind = $4)
       ),
       second AS (
         SELECT
           b.neighbor_id AS via_id,
           CASE WHEN e.src_id = b.neighbor_id THEN e.dst_id ELSE e.src_id END AS neighbor_id,
           b.root_relationship,
           b.root_direction,
           e.type AS relationship,
           CASE WHEN e.src_id = b.neighbor_id THEN 'out' ELSE 'in' END AS direction
         FROM base b
         JOIN edge e ON e.src_id = b.neighbor_id OR e.dst_id = b.neighbor_id
         JOIN hard_state hs ON hs.id = CASE WHEN e.src_id = b.neighbor_id THEN e.dst_id ELSE e.src_id END
         JOIN world_prominence wp ON wp.id = hs.prominence
         WHERE wp.rank >= $2 AND wp.rank <= $3
           AND CASE WHEN e.src_id = b.neighbor_id THEN e.dst_id ELSE e.src_id END <> $1::uuid
           AND ($4::text IS NULL OR hs.kind = $4)
       ),
       combined AS (
         SELECT
           neighbor_id,
           root_relationship,
           root_direction,
           root_relationship AS relationship,
           root_direction AS direction,
           NULL::uuid AS via_id,
           1 AS hops
         FROM base
         UNION ALL
         SELECT
           neighbor_id,
           root_relationship,
           root_direction,
           relationship,
           direction,
           via_id,
           2 AS hops
         FROM second
       )
       SELECT
         c.neighbor_id,
         c.root_relationship,
         c.root_direction,
         c.relationship,
         c.direction,
         c.via_id,
         c.hops,
         hs.id,
         hs.slug,
         hs.kind,
         hs.subkind,
         hs.name,
         hs.description,
         hs.status,
         hs.prominence,
         hs.created_at,
         hs.updated_at
       FROM combined c
       JOIN hard_state hs ON hs.id = c.neighbor_id
       JOIN world_prominence wp ON wp.id = hs.prominence
       WHERE wp.rank >= $2
         AND wp.rank <= $3
         AND c.hops <= $5
       ORDER BY c.hops ASC, hs.created_at ASC
       LIMIT $6`, [input.anchorId, minRank, maxRank, kindFilter, maxHops, limit]);
        const seen = new Set();
        const neighbors = [];
        for (const row of result.rows) {
            const relationship = row.root_relationship;
            const neighborId = row.neighbor_id;
            const direction = row.root_direction ?? 'out';
            const key = `${relationship}:${neighborId}:${direction}:${row.hops}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            const neighbor = {
                id: row.id,
                slug: row.slug,
                kind: row.kind,
                subkind: row.subkind ?? undefined,
                name: row.name,
                description: row.description ?? undefined,
                prominence: row.prominence,
                status: row.status ?? undefined,
                links: [],
                createdAt: row.created_at?.getTime?.() ? row.created_at.getTime() : now(),
                updatedAt: row.updated_at?.getTime?.() ? row.updated_at.getTime() : now(),
            };
            neighbors.push({
                direction,
                hops: row.hops,
                neighbor,
                relationship,
                via: row.via_id
                    ? {
                        direction: row.direction ?? direction,
                        id: row.via_id,
                        relationship: row.relationship,
                    }
                    : undefined,
            });
        }
        return neighbors;
    }
    async #reserveSlug(executor, base, id) {
        const normalized = base && base.trim().length > 0 ? base.trim() : toSnakeCase(id);
        let candidate = normalized;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const existing = await executor.query(`SELECT id FROM hard_state WHERE slug = $1 AND id <> $2::uuid`, [candidate, id]);
            if (existing.rowCount === 0) {
                return candidate;
            }
            candidate = `${normalized}_${randomUUID().slice(0, 6)}`;
        }
        return `${normalized}_${randomUUID().slice(0, 8)}`;
    }
}
export const createWorldSchemaStore = (options) => {
    const pool = options?.pool ?? createPool({ connectionString: options?.connectionString });
    return new PostgresWorldSchemaStore({ pool, graph: options?.graph });
};
