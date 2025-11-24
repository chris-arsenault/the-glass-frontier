import { Pool, type PoolClient } from 'pg';
export type PgOptions = {
    pool?: Pool;
    connectionString?: string;
};
export declare const resolveConnectionString: (options?: PgOptions) => string;
export declare const createPool: (options?: PgOptions) => Pool;
export declare const withTransaction: <T>(pool: Pool, handler: (client: PoolClient) => Promise<T>) => Promise<T>;
