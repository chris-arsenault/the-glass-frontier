/**
 * Low-level graph operations for nodes and edges.
 * These are domain-agnostic and used by all knowledge domain stores.
 */
export class GraphOperations {
    #pool;
    constructor(pool) {
        this.#pool = pool;
    }
    get pool() {
        return this.#pool;
    }
    /**
     * Insert or update a node in the graph.
     * @param executor - Pool or PoolClient to execute the query
     * @param id - Unique identifier for the node
     * @param kind - Node type/kind (e.g., 'location', 'character', 'chronicle')
     * @param props - Properties to store in the node
     */
    async upsertNode(executor, id, kind, props) {
        await executor.query(`INSERT INTO node (id, kind, props, created_at)
       VALUES ($1::uuid, $2, $3::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, props = EXCLUDED.props`, [id, kind, JSON.stringify(props ?? {})]);
    }
    /**
     * Delete a node from the graph.
     * Note: Cascading deletes will be handled by foreign key constraints.
     * @param executor - Pool or PoolClient to execute the query
     * @param id - Node ID to delete
     */
    async deleteNode(executor, id) {
        await executor.query('DELETE FROM node WHERE id = $1::uuid', [id]);
    }
    /**
     * Insert or update an edge in the graph.
     * @param executor - Pool or PoolClient to execute the query
     * @param edge - Edge data including src, dst, type, and optional props
     */
    async upsertEdge(executor, edge) {
        const edgeId = edge.id ?? crypto.randomUUID();
        await executor.query(`DELETE FROM edge WHERE src_id = $1::uuid AND dst_id = $2::uuid AND type = $3`, [edge.src, edge.dst, edge.type]);
        await executor.query(`INSERT INTO edge (id, src_id, dst_id, type, props, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb, now())`, [edgeId, edge.src, edge.dst, edge.type, JSON.stringify(edge.props ?? {})]);
    }
    /**
     * Delete an edge from the graph.
     * @param executor - Pool or PoolClient to execute the query
     * @param edge - Edge identifiers (src, dst, type)
     */
    async deleteEdge(executor, edge) {
        await executor.query(`DELETE FROM edge WHERE src_id = $1::uuid AND dst_id = $2::uuid AND type = $3`, [edge.src, edge.dst, edge.type]);
    }
    /**
     * Query nodes by kind.
     * @param executor - Pool or PoolClient to execute the query
     * @param kind - Node kind to filter by
     * @param limit - Maximum number of results
     */
    async queryNodesByKind(executor, kind, limit = 100) {
        const result = await executor.query(`SELECT id, kind, props, created_at FROM node WHERE kind = $1 LIMIT $2`, [kind, limit]);
        return result.rows;
    }
    /**
     * Get a single node by ID.
     * @param executor - Pool or PoolClient to execute the query
     * @param id - Node ID
     */
    async getNode(executor, id) {
        const result = await executor.query(`SELECT id, kind, props, created_at FROM node WHERE id = $1::uuid`, [id]);
        return result.rows[0] ?? null;
    }
    /**
     * Get edges connected to a node.
     * @param executor - Pool or PoolClient to execute the query
     * @param nodeId - Node ID
     * @param direction - Edge direction ('out', 'in', or 'both')
     * @param edgeType - Optional edge type filter
     */
    async getEdges(executor, nodeId, direction = 'both', edgeType) {
        let query = '';
        const params = [nodeId];
        if (direction === 'out' || direction === 'both') {
            query += `SELECT id, src_id, dst_id, type, props FROM edge WHERE src_id = $1::uuid`;
            if (edgeType) {
                query += ` AND type = $2`;
                params.push(edgeType);
            }
        }
        if (direction === 'both') {
            query += ' UNION ALL ';
        }
        if (direction === 'in' || direction === 'both') {
            const paramIndex = params.length + 1;
            query += `SELECT id, src_id, dst_id, type, props FROM edge WHERE dst_id = $1::uuid`;
            if (edgeType) {
                query += ` AND type = $${paramIndex}`;
                if (direction === 'in') {
                    params.push(edgeType);
                }
            }
        }
        const result = await executor.query(query, params);
        return result.rows;
    }
}
