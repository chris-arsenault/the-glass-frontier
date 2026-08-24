import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { WorldState } from '../src/worldState';
import { proposal, resetDatabase, startHarness } from './harness';

let pool: Pool;
let worldState: WorldState;

beforeAll(async () => {
  ({ pool, worldState } = await startHarness());
});

beforeEach(async () => {
  await resetDatabase(pool);
});

afterAll(async () => {
  await pool.end();
});

/**
 * A small world: the anchor faction leads an NPC (strong), sits beside a
 * neighbouring district (weak), and the NPC wields a relic two hops out.
 */
const seedWorld = async (): Promise<Record<string, string>> => {
  const result = await worldState.world.commitBatch(
    proposal({
      entities: [
        { kind: 'faction', name: 'Ash Cartel', ref: 'cartel', status: 'active', subkind: 'company' },
        { kind: 'npc', name: 'Vell', ref: 'npc', status: 'alive', subkind: 'leader' },
        { kind: 'geographic_location', name: 'Cinder Row', ref: 'row', status: 'inhabited', subkind: 'region' },
        { kind: 'geographic_location', name: 'Far Quay', ref: 'quay', status: 'inhabited', subkind: 'region' },
        { kind: 'artifact', name: 'Ash Seal', ref: 'relic', status: 'intact', subkind: 'relic' },
      ],
      lore: [
        {
          entity: { ref: 'cartel' },
          prose: 'The cartel keeps the ledgers of every debt on the Row.',
          tags: ['trade', 'archives'],
          title: 'The Ledgers',
        },
        {
          entity: { ref: 'npc' },
          prose: 'Vell took the seal from a dead broker and never explained how.',
          tags: ['trade'],
          title: 'How Vell Rose',
        },
      ],
      relationships: [
        // leads is defining (0.9); located_in is incidental (0.5).
        { dst: { ref: 'cartel' }, relationship: 'leads', src: { ref: 'npc' } },
        { dst: { ref: 'quay' }, relationship: 'located_in', src: { ref: 'row' } },
        { dst: { ref: 'row' }, relationship: 'governs', src: { ref: 'cartel' } },
        { dst: { ref: 'relic' }, relationship: 'possesses', src: { ref: 'npc' } },
      ],
    })
  );
  return result.entityIdsByRef;
};

describe('Context slice', () => {
  it('returns the anchor first and reaches its neighbours', async () => {
    const ids = await seedWorld();
    const slice = await worldState.world.getContextSlice({
      anchorId: ids.cartel,
      focusIds: [ids.cartel],
      focusTags: [],
      limit: 7,
      loreLimit: 2,
      maxHops: 2,
      minProminence: 'recognized',
    });

    expect(slice[0]?.id).toBe(ids.cartel);
    const reached = slice.map((entry) => entry.id);
    expect(reached).toContain(ids.npc);
    expect(reached).toContain(ids.row);
  });

  it('ranks a defining relationship above an incidental one at the same distance', async () => {
    const ids = await seedWorld();
    const slice = await worldState.world.getContextSlice({
      anchorId: ids.cartel,
      focusIds: [ids.cartel],
      focusTags: [],
      limit: 7,
      loreLimit: 0,
      maxHops: 2,
      minProminence: 'recognized',
    });
    const byId = new Map(slice.map((entry) => [entry.id, entry]));

    // Vell is one hop through leads (0.9); Far Quay is two hops and the
    // second is located_in (0.5), so it must rank lower.
    const vell = byId.get(ids.npc);
    const quay = byId.get(ids.quay);
    expect(vell).toBeDefined();
    if (quay !== undefined && vell !== undefined) {
      expect(vell.reach).toBeGreaterThan(quay.reach);
    }
  });

  it('attaches lore and lifts entities whose tags match the chronicle focus', async () => {
    const ids = await seedWorld();
    const withoutTags = await worldState.world.getContextSlice({
      anchorId: ids.row,
      focusIds: [ids.row],
      focusTags: [],
      limit: 7,
      loreLimit: 2,
      maxHops: 2,
      minProminence: 'recognized',
    });
    const withTags = await worldState.world.getContextSlice({
      anchorId: ids.row,
      focusIds: [ids.row],
      focusTags: ['trade'],
      limit: 7,
      loreLimit: 2,
      maxHops: 2,
      minProminence: 'recognized',
    });

    const cartelPlain = withoutTags.find((entry) => entry.id === ids.cartel);
    const cartelTagged = withTags.find((entry) => entry.id === ids.cartel);
    expect(cartelPlain).toBeDefined();
    expect(cartelTagged?.score ?? 0).toBeGreaterThan(cartelPlain?.score ?? 0);
    expect(cartelTagged?.lore[0]?.title).toBe('The Ledgers');
  });

  it('surfaces marginal local color when the floor allows it', async () => {
    const ids = await seedWorld();
    const local = await worldState.world.commitBatch(
      proposal({
        entities: [
          {
            kind: 'installation',
            name: 'The Under-Docks',
            prominence: 'marginal',
            ref: 'interior',
            status: 'hidden',
            subkind: 'station',
          },
          {
            kind: 'creature',
            name: 'Sump Eel',
            prominence: 'marginal',
            ref: 'eel',
            status: 'alive',
            subkind: 'animal',
          },
        ],
        relationships: [
          { dst: { id: ids.row }, relationship: 'located_in', src: { ref: 'interior' } },
          { dst: { ref: 'interior' }, relationship: 'inhabits', src: { ref: 'eel' } },
        ],
      })
    );

    const gated = await worldState.world.getContextSlice({
      anchorId: ids.row,
      focusIds: [ids.row],
      focusTags: [],
      limit: 10,
      loreLimit: 0,
      maxHops: 2,
      minProminence: 'recognized',
    });
    const open = await worldState.world.getContextSlice({
      anchorId: ids.row,
      focusIds: [ids.row],
      focusTags: [],
      limit: 10,
      loreLimit: 0,
      maxHops: 2,
      minProminence: 'marginal',
    });

    const gatedIds = gated.map((entry) => entry.id);
    expect(gatedIds).not.toContain(local.entityIdsByRef.interior);
    const openIds = open.map((entry) => entry.id);
    expect(openIds).toContain(local.entityIdsByRef.interior);
    expect(openIds).toContain(local.entityIdsByRef.eel);
  });

  it('resolves a location by display name, case-insensitively', async () => {
    const ids = await seedWorld();

    const found = await worldState.world.findLocationByName({ name: 'cinder row' });
    expect(found?.id).toBe(ids.row);

    const missing = await worldState.world.findLocationByName({ name: 'Nowhere At All' });
    expect(missing).toBeNull();
  });

  it('marks a veiled shell unwritten until play establishes something about it', async () => {
    const ids = await seedWorld();
    const veiled = await worldState.world.commitBatch(
      proposal({
        entities: [
          {
            description: 'Alen Dorath returns broken bells tuned to other voices.',
            kind: 'npc',
            name: 'Alen Dorath',
            ref: 'shell',
            status: 'alive',
            subkind: 'worker',
            veiled: true,
            veilTagline: 'Alen Dorath returns broken bells tuned to other voices.',
          },
        ],
        relationships: [
          { dst: { id: ids.cartel }, relationship: 'leads', src: { ref: 'shell' } },
        ],
      })
    );
    const shellId = veiled.entityIdsByRef.shell;
    const sliceInput = {
      anchorId: ids.cartel,
      focusIds: [ids.cartel],
      focusTags: [],
      limit: 7,
      loreLimit: 2,
      maxHops: 2,
      minProminence: 'marginal' as const,
    };

    const before = await worldState.world.getContextSlice(sliceInput);
    expect(before.find((entry) => entry.id === shellId)?.unwritten).toBe(true);

    await worldState.world.commitBatch(
      proposal({
        lore: [
          {
            entity: { id: shellId },
            prose: 'Alen traded the tuned bell for passage off the Row.',
            title: 'The Bell He Kept',
          },
        ],
        source: 'play',
        sourceId: 'chronicle-1',
      })
    );

    const after = await worldState.world.getContextSlice(sliceInput);
    expect(after.find((entry) => entry.id === shellId)?.unwritten).toBe(false);
  });

  it('returns nothing when there is no focus to walk from', async () => {
    await seedWorld();
    const slice = await worldState.world.getContextSlice({
      focusIds: [],
      focusTags: [],
      limit: 7,
      loreLimit: 2,
      maxHops: 2,
      minProminence: 'recognized',
    });

    expect(slice).toEqual([]);
  });
});

describe('Weighted traversal', () => {
  it('reaches beyond two hops when asked', async () => {
    const ids = await seedWorld();
    const twoHops = await worldState.world.listNeighbors({
      id: ids.cartel,
      maxHops: 1,
      minProminence: 'recognized',
    });
    const threeHops = await worldState.world.listNeighbors({
      id: ids.cartel,
      maxHops: 3,
      minProminence: 'recognized',
    });

    // The relic is two steps out: cartel -> Vell -> Ash Seal.
    expect(twoHops.map((entry) => entry.neighbor.id)).not.toContain(ids.relic);
    expect(threeHops.map((entry) => entry.neighbor.id)).toContain(ids.relic);
  });

  it('orders neighbours by path strength rather than insertion order', async () => {
    const ids = await seedWorld();
    const neighbors = await worldState.world.listNeighbors({
      id: ids.cartel,
      maxHops: 1,
      minProminence: 'recognized',
    });

    // leads (0.9) outranks governs (0.7) from the same origin.
    expect(neighbors[0]?.neighbor.id).toBe(ids.npc);
  });
});
