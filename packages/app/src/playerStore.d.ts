import type { Player, PlayerPreferences } from '@glass-frontier/dto';
import type { Pool } from 'pg';
export declare class PlayerStore {
    #private;
    constructor(options?: {
        pool?: Pool;
        connectionString?: string;
    });
    get(playerId: string): Promise<Player | null>;
    ensure(playerId: string): Promise<Player>;
    upsert(player: Player): Promise<Player>;
    setPreferences(playerId: string, preferences: PlayerPreferences): Promise<PlayerPreferences>;
}
export declare const createPlayerStore: (options?: {
    pool?: Pool;
    connectionString?: string;
}) => PlayerStore;
