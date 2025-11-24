import { createPool } from './pg';
const serializeJson = (value) => JSON.stringify(value ?? {});
const toNullableString = (value) => typeof value === 'string' ? value.trim() : null;
const defaultPreferences = () => ({ feedbackVisibility: 'all' });
const defaultMetadata = () => ({ tags: [], timestamp: Date.now() });
const normalizePreferences = (preferences) => {
    if (preferences &&
        typeof preferences === 'object' &&
        'feedbackVisibility' in preferences &&
        typeof preferences.feedbackVisibility === 'string') {
        return { feedbackVisibility: preferences.feedbackVisibility };
    }
    return defaultPreferences();
};
const normalizeMetadata = (metadata) => {
    if (metadata &&
        typeof metadata === 'object' &&
        'tags' in metadata &&
        Array.isArray(metadata.tags) &&
        'timestamp' in metadata &&
        typeof metadata.timestamp === 'number') {
        return {
            tags: [...metadata.tags],
            timestamp: metadata.timestamp,
        };
    }
    return defaultMetadata();
};
export class PlayerStore {
    #pool;
    constructor(options) {
        this.#pool =
            options?.pool ??
                createPool({
                    connectionString: options?.connectionString,
                    pool: options?.pool,
                });
    }
    async get(playerId) {
        const result = await this.#pool.query('SELECT id, username, email, preferences, metadata FROM app.player WHERE id = $1', [playerId]);
        const row = result.rows[0];
        if (row === undefined) {
            return null;
        }
        return {
            email: toNullableString(row.email) ?? undefined,
            id: row.id,
            metadata: normalizeMetadata(row.metadata),
            preferences: normalizePreferences(row.preferences),
            username: row.username,
        };
    }
    async ensure(playerId) {
        const existing = await this.get(playerId);
        if (existing !== null) {
            return existing;
        }
        const blank = {
            email: undefined,
            id: playerId,
            metadata: defaultMetadata(),
            preferences: defaultPreferences(),
            username: playerId,
        };
        return this.upsert(blank);
    }
    async upsert(player) {
        const normalized = this.#normalize(player);
        await this.#pool.query(`INSERT INTO app.player (id, username, email, preferences, metadata, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, now())
       ON CONFLICT (id) DO UPDATE
       SET username = EXCLUDED.username,
           email = EXCLUDED.email,
           preferences = EXCLUDED.preferences,
           metadata = EXCLUDED.metadata,
           updated_at = now()`, [
            normalized.id,
            normalized.username,
            normalized.email ?? null,
            serializeJson(normalized.preferences ?? {}),
            serializeJson(normalized.metadata ?? {}),
        ]);
        return normalized;
    }
    async setPreferences(playerId, preferences) {
        const existing = await this.ensure(playerId);
        await this.upsert({
            ...existing,
            preferences,
        });
        return preferences;
    }
    #normalize(player) {
        const username = player.username.trim();
        if (username.length === 0) {
            throw new Error('Player username is required');
        }
        return {
            email: toNullableString(player.email) ?? undefined,
            id: player.id.trim(),
            metadata: normalizeMetadata(player.metadata),
            preferences: normalizePreferences(player.preferences),
            username,
        };
    }
}
export const createPlayerStore = (options) => new PlayerStore(options);
