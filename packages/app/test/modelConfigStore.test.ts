import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { ModelConfigStore } from '../src/modelConfigStore';

type SlotRow = { category: string; model_id: string; player_id: null | string; slot: number };

/**
 * The slot lookup is one query per slot with a NULLS LAST fallback, so the
 * fake answers the way Postgres would: the player's own row wins, the shared
 * default stands in, and a slot nobody configured returns nothing at all.
 */
const poolOf = (rows: SlotRow[]): { pool: Pool; queries: unknown[][] } => {
  const queries: unknown[][] = [];
  const pool = {
    query: (text: string, values: unknown[]) => {
      queries.push([text, values]);
      if (!text.includes('SELECT')) {
        return Promise.resolve({ rows: [] });
      }
      const [category, slot, playerId] = values as [string, number, null | string];
      const matches = rows
        .filter((row) => row.category === category && row.slot === slot)
        .filter((row) => row.player_id === playerId || row.player_id === null)
        .sort((left, right) => (left.player_id === null ? 1 : 0) - (right.player_id === null ? 1 : 0));
      return Promise.resolve({ rows: matches.slice(0, 1) });
    },
  } as unknown as Pool;
  return { pool, queries };
};

const PROSE = 'prose' as const;
const PLAYER = 'player-1';
const SONNET = 'claude-sonnet-5';

describe('prose model slots', () => {
  it('returns each configured model with the slot it fills', async () => {
    const { pool } = poolOf([
      { category: PROSE, model_id: SONNET, player_id: null, slot: 1 },
      { category: PROSE, model_id: 'gpt-oss-120b', player_id: PLAYER, slot: 2 },
    ]);
    const store = new ModelConfigStore({ pool });

    await expect(store.listModelsForCategory(PROSE, PLAYER)).resolves.toEqual([
      { modelId: SONNET, slot: 1 },
      { modelId: 'gpt-oss-120b', slot: 2 },
    ]);
  });

  it('leaves a gap where a slot is unset instead of promoting the next one', async () => {
    const { pool } = poolOf([
      { category: PROSE, model_id: SONNET, player_id: null, slot: 1 },
      { category: PROSE, model_id: 'qwen3-32b', player_id: PLAYER, slot: 3 },
    ]);
    const store = new ModelConfigStore({ pool });
    const configured = await store.listModelsForCategory(PROSE, PLAYER);

    // The tertiary stays tertiary: position in the list is not the slot.
    expect(configured.map((entry) => entry.slot)).toEqual([1, 3]);
  });

  it('prefers a player\'s own choice over the shared default', async () => {
    const { pool } = poolOf([
      { category: PROSE, model_id: SONNET, player_id: null, slot: 1 },
      { category: PROSE, model_id: 'kimi-k2-thinking', player_id: PLAYER, slot: 1 },
    ]);
    const store = new ModelConfigStore({ pool });

    await expect(store.getModelForCategory(PROSE, PLAYER)).resolves.toBe('kimi-k2-thinking');
  });

  it('is one model and no shadows when only the primary is set', async () => {
    const { pool } = poolOf([
      { category: PROSE, model_id: SONNET, player_id: null, slot: 1 },
    ]);
    const store = new ModelConfigStore({ pool });

    await expect(store.listModelsForCategory(PROSE, PLAYER)).resolves.toHaveLength(1);
  });

  it('clears a shadow slot by deleting the row, not by writing an empty one', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = new ModelConfigStore({ pool: { query } as unknown as Pool });

    await store.clearCategoryModel(PROSE, PLAYER, 3);

    expect(query.mock.calls[0]?.[0]).toContain('DELETE FROM app.model_category_config');
    expect(query.mock.calls[0]?.[1]).toEqual([PROSE, PLAYER, 3]);
  });
});
