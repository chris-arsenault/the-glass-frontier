import type { HardStateStatus } from '@glass-frontier/dto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ProposalRejected } from '../src/canonValidation';
import type { WorldState } from '../src/worldState';
import { proposal, resetDatabase, seedEntity, startHarness } from './harness';

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

describe('Canon batch commit', () => {
  it('resolves relationships between entities created in the same batch', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          { kind: 'faction', name: 'Glass Wardens', ref: 'faction', status: 'active', subkind: 'order' },
          { kind: 'npc', name: 'Mirin', ref: 'npc', status: 'alive', subkind: 'ally' },
        ],
        relationships: [
          { dst: { ref: 'npc' }, relationship: 'ally_of', src: { ref: 'faction' } },
        ],
      })
    );

    const faction = await worldState.world.getEntity({ id: result.entityIdsByRef.faction });
    const npc = await worldState.world.getEntity({ id: result.entityIdsByRef.npc });

    expect(result.entityCount).toBe(2);
    expect(faction?.links).toContainEqual({
      direction: 'out',
      relationship: 'ally_of',
      strength: 0.7,
      targetId: npc?.id,
    });
    expect(npc?.links).toContainEqual({
      direction: 'in',
      relationship: 'ally_of',
      strength: 0.7,
      targetId: faction?.id,
    });
  });

  it('applies the relationship default strength when none is given', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          { kind: 'location', name: 'Quay', ref: 'a', status: 'known', subkind: 'region' },
          { kind: 'location', name: 'Wharf', ref: 'b', status: 'known', subkind: 'district' },
        ],
        relationships: [
          { dst: { ref: 'b' }, relationship: 'adjacent_to', src: { ref: 'a' } },
          { dst: { ref: 'b' }, relationship: 'contains', src: { ref: 'a' }, strength: 0.95 },
        ],
      })
    );
    const a = await worldState.world.getEntity({ id: result.entityIdsByRef.a });

    // adjacent_to is spatial and incidental; an explicit value still wins.
    expect(a?.links.find((link) => link.relationship === 'adjacent_to')?.strength).toBe(0.2);
    expect(a?.links.find((link) => link.relationship === 'contains')?.strength).toBe(0.95);
  });

  it('re-ingests by external key rather than duplicating', async () => {
    const first = await worldState.world.commitBatch(
      proposal({
        entities: [
          {
            externalKey: 'tsonu:ashfall',
            kind: 'location',
            name: 'Ashfall',
            ref: 'x',
            status: 'known',
            subkind: 'site',
          },
        ],
      })
    );
    const second = await worldState.world.commitBatch(
      proposal({
        entities: [
          {
            description: 'Now with a description.',
            externalKey: 'tsonu:ashfall',
            kind: 'location',
            name: 'Ashfall',
            ref: 'x',
            status: 'ruined',
            subkind: 'site',
          },
        ],
      })
    );

    expect(second.entityIdsByRef.x).toBe(first.entityIdsByRef.x);
    const all = await worldState.world.listEntities({ kind: 'location', minProminence: 'forgotten' });
    expect(all).toHaveLength(1);
    expect(all[0]?.status).toBe('ruined');
    expect(all[0]?.description).toBe('Now with a description.');
  });

  it('gives colliding names a counted suffix, not a random one', async () => {
    await seedEntity(worldState, { kind: 'location', name: 'Grey Harbor', status: 'known', subkind: 'site' });
    await seedEntity(worldState, { kind: 'location', name: 'Grey Harbor', status: 'known', subkind: 'site' });
    const listed = await worldState.world.listEntities({
      kind: 'location',
      minProminence: 'forgotten',
    });

    expect(listed.map((entity) => entity.slug).sort()).toEqual(['grey_harbor', 'grey_harbor_2']);
  });

  it('removes everything a batch wrote when the batch is reverted', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          { kind: 'faction', name: 'Ash Cartel', ref: 'faction', status: 'active', subkind: 'cartel' },
          { kind: 'location', name: 'Cinder Row', ref: 'place', status: 'known', subkind: 'district' },
        ],
        lore: [{ entity: { ref: 'faction' }, prose: 'They keep the ledgers.', title: 'Ledgers' }],
        relationships: [
          { dst: { ref: 'place' }, relationship: 'controls', src: { ref: 'faction' } },
        ],
      })
    );

    await worldState.world.revertBatch(result.batchId);

    expect(await worldState.world.getEntity({ id: result.entityIdsByRef.faction })).toBeNull();
    expect(await worldState.world.getEntity({ id: result.entityIdsByRef.place })).toBeNull();
    const edges = await pool.query('SELECT 1 FROM edge WHERE batch_id = $1::uuid', [result.batchId]);
    expect(edges.rowCount).toBe(0);
  });
});

describe('Canon proposal validation', () => {
  it('rejects an unsupported status and writes nothing', async () => {
    await expect(
      worldState.world.commitBatch(
        proposal({
          entities: [
            { kind: 'npc', name: 'Unknown', status: 'ghost' as unknown as HardStateStatus },
          ],
        })
      )
    ).rejects.toThrowError(/Status ghost is not valid for kind npc/);

    const listed = await worldState.world.listEntities({ minProminence: 'forgotten' });
    expect(listed).toHaveLength(0);
  });

  it('rejects a relationship the vocabulary does not allow between those kinds', async () => {
    await expect(
      worldState.world.commitBatch(
        proposal({
          entities: [
            { kind: 'location', name: 'Forbidden Site', ref: 'loc', status: 'known', subkind: 'site' },
            { kind: 'artifact', name: 'Lost Relic', ref: 'relic', status: 'intact', subkind: 'relic' },
          ],
          relationships: [
            { dst: { ref: 'relic' }, relationship: 'controls', src: { ref: 'loc' } },
          ],
        })
      )
    ).rejects.toThrowError(/not allowed from location to artifact/);
  });

  it('rejects the banned generic verb by name', async () => {
    await expect(
      worldState.world.commitBatch(
        proposal({
          entities: [
            { kind: 'location', name: 'Somewhere', ref: 'a', status: 'known', subkind: 'site' },
            { kind: 'location', name: 'Elsewhere', ref: 'b', status: 'known', subkind: 'site' },
          ],
          relationships: [{ dst: { ref: 'b' }, relationship: 'related_to', src: { ref: 'a' } }],
        })
      )
    ).rejects.toThrowError(/related_to is banned/);
  });

  it('rejects a reference to an entity that does not exist', async () => {
    await expect(
      worldState.world.commitBatch(
        proposal({
          entities: [{ kind: 'npc', name: 'Solitary', ref: 'npc', status: 'alive', subkind: 'ally' }],
          relationships: [
            { dst: { ref: 'nobody' }, relationship: 'ally_of', src: { ref: 'npc' } },
          ],
        })
      )
    ).rejects.toThrowError(/ref nobody is not an existing entity/);
  });

  it('reports every violation rather than only the first', async () => {
    const rejection = await worldState.world
      .commitBatch(
        proposal({
          entities: [
            { kind: 'npc', name: 'One', status: 'ghost' as unknown as HardStateStatus },
            // 'planet' is a real subkind, just not one an npc may take.
            { kind: 'npc', name: 'Two', subkind: 'planet' },
          ],
        })
      )
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(ProposalRejected);
    expect((rejection as ProposalRejected).violations).toHaveLength(2);
  });
});

describe('World lore', () => {
  it('commits lore fragments alongside the entity they belong to', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          { kind: 'location', name: 'Lore Root', ref: 'root', status: 'known', subkind: 'site' },
        ],
        lore: [
          {
            entity: { ref: 'root' },
            prose: 'An old story about the root.',
            tags: ['Myth', 'origin'],
            title: 'Origin Story',
          },
        ],
      })
    );
    const listed = await worldState.world.listLoreFragmentsByEntity({
      entityId: result.entityIdsByRef.root,
    });

    expect(listed).toHaveLength(1);
    expect(listed[0]?.title).toBe('Origin Story');
    expect(listed[0]?.tags).toEqual(['myth', 'origin']);
  });

  it('returns fragments for several entities in one query', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          { kind: 'location', name: 'First', ref: 'a', status: 'known', subkind: 'site' },
          { kind: 'location', name: 'Second', ref: 'b', status: 'known', subkind: 'site' },
        ],
        lore: [
          { entity: { ref: 'a' }, prose: 'About the first.', title: 'First Tale' },
          { entity: { ref: 'b' }, prose: 'About the second.', title: 'Second Tale' },
        ],
      })
    );
    const grouped = await worldState.world.listLoreFragmentsByEntities({
      entityIds: [result.entityIdsByRef.a, result.entityIdsByRef.b],
    });

    expect(grouped.get(result.entityIdsByRef.a)?.[0]?.title).toBe('First Tale');
    expect(grouped.get(result.entityIdsByRef.b)?.[0]?.title).toBe('Second Tale');
  });
});
