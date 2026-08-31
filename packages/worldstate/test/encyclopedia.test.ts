import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createEncyclopediaStore, playerEncyclopediaEntry } from '../src/encyclopediaStore';
import { seedCanon } from '../src/seedCanon';
import { startHarness, type Harness } from './harness';

describe('Encyclopedia canon snapshot', () => {
  let harness: Harness;
  let pool: Pool;

  beforeAll(async () => {
    harness = await startHarness();
    pool = harness.pool;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('imports Atlas and Encyclopedia content as one authoritative batch', async () => {
    const first = await seedCanon(pool);
    const second = await seedCanon(pool);

    expect(first).toMatchObject({
      classificationCount: 354,
      encyclopediaCount: 283,
      entityCount: 553,
      status: 'applied',
    });
    expect(second).toMatchObject({
      batchId: first.batchId,
      classificationCount: 354,
      encyclopediaCount: 283,
      status: 'unchanged',
    });

    const counts = await pool.query<{
      classifications: string;
      context_tags: string;
      encyclopedia: string;
    }>(
      `SELECT
         (SELECT count(*) FROM encyclopedia_entry)::text AS encyclopedia,
         (SELECT count(*) FROM reference_context_tag)::text AS context_tags,
         (SELECT count(*) FROM atlas_encyclopedia_classification)::text AS classifications`
    );
    expect(counts.rows[0]).toEqual({
      classifications: '354',
      context_tags: '21',
      encyclopedia: '283',
    });
  });

  it('keeps applicable material outside the Atlas graph', async () => {
    const store = createEncyclopediaStore({ pool });
    const applicable = await store.listApplicable({
      terms: [{ scope: 'place', tag: 'hot', type: 'tag' }],
    });
    expect(applicable.some((entry) => entry.slug === 'ash-skater')).toBe(true);

    const ashSkater = await store.getEntry({ slug: 'encyclopedia:ash-skater' });
    expect(ashSkater?.externalKey).toBe('ash_skater');
    expect(ashSkater?.instances.some((entry) => entry.title === 'The Crucible-Front Skater')).toBe(
      true
    );

    const graphLeak = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM entity
       WHERE external_key = ANY($1::text[])`,
      [applicable.map((entry) => `tsonu:${entry.externalKey}`)]
    );
    expect(graphLeak.rows[0]?.count).toBe('0');
  });

  it('returns player-safe prose and character options', async () => {
    const store = createEncyclopediaStore({ pool });
    const species = await store.listCharacterOptions('species');
    const cultures = await store.listCharacterOptions('culture');
    expect(species).toHaveLength(5);
    expect(cultures).toHaveLength(4);

    const elves = await store.getEntry({ includeDm: true, slug: 'elves' });
    expect(elves).not.toBeNull();
    const publicElves = playerEncyclopediaEntry(elves!);
    expect(publicElves.sections.every((section) => section.audience === 'player')).toBe(true);
    expect('usage' in publicElves).toBe(false);
  });
});
