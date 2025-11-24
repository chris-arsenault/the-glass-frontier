/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/strict-boolean-expressions */
import { Pool } from 'pg';
const DEFAULT_CONNECTION_STRING = 'postgres://postgres:postgres@localhost:5432/worldstate';
export const resolveConnectionString = (options) => {
    const candidate = options?.connectionString ?? process.env.GLASS_FRONTIER_DATABASE_URL ?? DEFAULT_CONNECTION_STRING;
    const trimmed = candidate.trim();
    if (trimmed.length === 0) {
        throw new Error('GLASS_FRONTIER_DATABASE_URL is required for the app store.');
    }
    return trimmed;
};
export const createPool = (options) => {
    if (options?.pool) {
        return options.pool;
    }
    return new Pool({
        connectionString: resolveConnectionString(options),
        max: 10,
    });
};
export const withTransaction = async (pool, handler) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await handler(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
};
