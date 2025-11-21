/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import type { Metadata, Player, PlayerPreferences } from '@glass-frontier/dto';
import type { Pool } from 'pg';

import { createPool } from './pg';

const serializeJson = (value: unknown): string => JSON.stringify(value ?? {});

const toNullableString = (value?: string | null): string | null =>
  typeof value === 'string' ? value.trim() : null;

type PlayerRow = {
  id: string;
  username: string;
  email: string | null;
  preferences: PlayerPreferences | Record<string, unknown> | null;
  metadata: Metadata | Record<string, unknown> | null;
};

const defaultPreferences = (): PlayerPreferences => ({ feedbackVisibility: 'all' });
const defaultMetadata = (): Metadata => ({ tags: [], timestamp: Date.now() });

const normalizePreferences = (
  preferences?: PlayerPreferences | Record<string, unknown> | null
): PlayerPreferences => {
  if (
    preferences &&
    typeof preferences === 'object' &&
    'feedbackVisibility' in preferences &&
    typeof (preferences as PlayerPreferences).feedbackVisibility === 'string'
  ) {
    return { feedbackVisibility: (preferences as PlayerPreferences).feedbackVisibility };
  }
  return defaultPreferences();
};

const normalizeMetadata = (metadata?: Metadata | Record<string, unknown> | null): Metadata => {
  if (
    metadata &&
    typeof metadata === 'object' &&
    'tags' in metadata &&
    Array.isArray((metadata as Metadata).tags) &&
    'timestamp' in metadata &&
    typeof (metadata as Metadata).timestamp === 'number'
  ) {
    return {
      tags: [...(metadata as Metadata).tags],
      timestamp: (metadata as Metadata).timestamp,
    };
  }
  return defaultMetadata();
};

export class PlayerStore {
  readonly #pool: Pool;

  constructor(options?: { pool?: Pool; connectionString?: string }) {
    this.#pool =
      options?.pool ??
      createPool({
        connectionString: options?.connectionString,
        pool: options?.pool,
      });
  }

  async get(playerId: string): Promise<Player | null> {
    const result = await this.#pool.query<PlayerRow>(
      'SELECT id, username, email, preferences, metadata FROM app.player WHERE id = $1',
      [playerId]
    );
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

  async ensure(playerId: string): Promise<Player> {
    const existing = await this.get(playerId);
    if (existing !== null) {
      return existing;
    }
    const blank: Player = {
      email: undefined,
      id: playerId,
      metadata: defaultMetadata(),
      preferences: defaultPreferences(),
      username: playerId,
    };
    return this.upsert(blank);
  }

  async upsert(player: Player): Promise<Player> {
    const normalized = this.#normalize(player);
    await this.#pool.query(
      `INSERT INTO app.player (id, username, email, preferences, metadata, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, now())
       ON CONFLICT (id) DO UPDATE
       SET username = EXCLUDED.username,
           email = EXCLUDED.email,
           preferences = EXCLUDED.preferences,
           metadata = EXCLUDED.metadata,
           updated_at = now()`,
      [
        normalized.id,
        normalized.username,
        normalized.email ?? null,
        serializeJson(normalized.preferences ?? {}),
        serializeJson(normalized.metadata ?? {}),
      ]
    );
    return normalized;
  }

  async setPreferences(playerId: string, preferences: PlayerPreferences): Promise<PlayerPreferences> {
    const existing = await this.ensure(playerId);
    await this.upsert({
      ...existing,
      preferences,
    });
    return preferences;
  }

  #normalize(player: Player): Player {
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

export const createPlayerStore = (options?: { pool?: Pool; connectionString?: string }): PlayerStore =>
  new PlayerStore(options);
