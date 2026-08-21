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
          { kind: 'faction', name: 'Glass Wardens', ref: 'faction', status: 'active', subkind: 'religious_order' },
          { kind: 'npc', name: 'Mirin', ref: 'npc', status: 'alive', subkind: 'specialist' },
        ],
        relationships: [
          { dst: { ref: 'faction' }, relationship: 'member_of', src: { ref: 'npc' } },
        ],
      })
    );

    const faction = await worldState.world.getEntity({ id: result.entityIdsByRef.faction });
    const npc = await worldState.world.getEntity({ id: result.entityIdsByRef.npc });

    expect(result.entityCount).toBe(2);
    expect(npc?.links).toContainEqual({
      direction: 'out',
      relationship: 'member_of',
      strength: 0.7,
      targetId: faction?.id,
    });
    expect(faction?.links).toContainEqual({
      direction: 'in',
      relationship: 'member_of',
      strength: 0.7,
      targetId: npc?.id,
    });
  });

  it('applies the relationship default strength when none is given', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          { kind: 'geographic_location', name: 'Quay', ref: 'a', status: 'charted', subkind: 'region' },
          { kind: 'geographic_location', name: 'Wharf', ref: 'b', status: 'charted', subkind: 'region' },
        ],
        relationships: [
          { dst: { ref: 'b' }, relationship: 'located_in', src: { ref: 'a' } },
          { dst: { ref: 'b' }, relationship: 'part_of', src: { ref: 'a' }, strength: 0.95 },
        ],
      })
    );
    const a = await worldState.world.getEntity({ id: result.entityIdsByRef.a });

    // located_in carries its spatial prior; an explicit value still wins.
    expect(a?.links.find((link) => link.relationship === 'located_in')?.strength).toBe(0.5);
    expect(a?.links.find((link) => link.relationship === 'part_of')?.strength).toBe(0.95);
  });

  it('records the in-world years a relation held, when the source gives them', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          { kind: 'creature', name: 'Marrower', ref: 'creature', status: 'alive', subkind: 'animal' },
          { kind: 'installation', name: 'Orra', ref: 'hab', status: 'inhabited', subkind: 'settlement' },
        ],
        relationships: [
          { dst: { ref: 'hab' }, relationship: 'inhabits', since: 2435, src: { ref: 'creature' } },
        ],
      })
    );
    const creature = await worldState.world.getEntity({ id: result.entityIdsByRef.creature });

    const link = creature?.links.find((entry) => entry.relationship === 'inhabits');
    expect(link?.since).toBe(2435);
    expect(link?.until).toBeUndefined();
  });

  it('lets any entity be a place: kind supplies the default, the entity may override', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          { kind: 'installation', name: 'Five Landing', ref: 'hab', subkind: 'settlement' },
          // A named ship serving as a hub is somewhere a scene can be set.
          { isLocation: true, kind: 'transport', name: 'The Long Answer', ref: 'ship', subkind: 'vessel' },
          { kind: 'npc', name: 'Passenger', ref: 'npc', status: 'alive', subkind: 'worker' },
        ],
      })
    );

    const hab = await worldState.world.getEntity({ id: result.entityIdsByRef.hab });
    const ship = await worldState.world.getEntity({ id: result.entityIdsByRef.ship });
    const npc = await worldState.world.getEntity({ id: result.entityIdsByRef.npc });
    expect(hab?.isLocation).toBe(true);
    expect(ship?.isLocation).toBe(true);
    expect(npc?.isLocation).toBe(false);

    const foundShip = await worldState.world.findLocationByName({ name: 'the long answer' });
    expect(foundShip?.id).toBe(result.entityIdsByRef.ship);
    const places = await worldState.world.listEntities({
      isLocation: true,
      minProminence: 'forgotten',
    });
    expect(places.map((entity) => entity.name).sort()).toEqual([
      'Five Landing',
      'The Long Answer',
    ]);
  });

  it('stores the fact card verbatim', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          {
            facts: { born: 2410, occupation: 'Deep reader' },
            kind: 'npc',
            name: 'Sella',
            ref: 'npc',
            status: 'alive',
            subkind: 'specialist',
          },
        ],
      })
    );
    const npc = await worldState.world.getEntity({ id: result.entityIdsByRef.npc });

    expect(npc?.facts).toEqual({ born: 2410, occupation: 'Deep reader' });
  });

  it('re-ingests by external key rather than duplicating', async () => {
    const first = await worldState.world.commitBatch(
      proposal({
        entities: [
          {
            externalKey: 'tsonu:ashfall',
            kind: 'geographic_location',
            name: 'Ashfall',
            ref: 'x',
            status: 'charted',
            subkind: 'settlement',
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
            kind: 'geographic_location',
            name: 'Ashfall',
            ref: 'x',
            status: 'ruined',
            subkind: 'settlement',
          },
        ],
      })
    );

    expect(second.entityIdsByRef.x).toBe(first.entityIdsByRef.x);
    const all = await worldState.world.listEntities({ kind: 'geographic_location', minProminence: 'forgotten' });
    expect(all).toHaveLength(1);
    expect(all[0]?.status).toBe('ruined');
    expect(all[0]?.description).toBe('Now with a description.');
  });

  it('gives colliding names a counted suffix, not a random one', async () => {
    await seedEntity(worldState, { kind: 'geographic_location', name: 'Grey Harbor', subkind: 'settlement' });
    await seedEntity(worldState, { kind: 'geographic_location', name: 'Grey Harbor', subkind: 'settlement' });
    const listed = await worldState.world.listEntities({
      kind: 'geographic_location',
      minProminence: 'forgotten',
    });

    expect(listed.map((entity) => entity.slug).sort()).toEqual(['grey_harbor', 'grey_harbor_2']);
  });

  it('removes everything a batch wrote when the batch is reverted', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          { kind: 'faction', name: 'Ash Cartel', ref: 'faction', status: 'active', subkind: 'company' },
          { kind: 'geographic_location', name: 'Cinder Row', ref: 'place', status: 'inhabited', subkind: 'region' },
        ],
        lore: [{ entity: { ref: 'faction' }, prose: 'They keep the ledgers.', title: 'Ledgers' }],
        relationships: [
          { dst: { ref: 'place' }, relationship: 'governs', src: { ref: 'faction' } },
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
  it('accepts any status string; the source declares no status vocabulary', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          { kind: 'npc', name: 'Weathered', status: 'gone to the rind', subkind: 'worker' },
        ],
      })
    );

    expect(result.entityCount).toBe(1);
  });

  it('rejects a lore tag outside the world tag vocabulary and writes nothing', async () => {
    await expect(
      worldState.world.commitBatch(
        proposal({
          entities: [
            { kind: 'npc', name: 'Tagged', ref: 'npc', status: 'alive', subkind: 'specialist' },
          ],
          lore: [
            { entity: { ref: 'npc' }, prose: 'A story.', tags: ['not-a-real-tag'], title: 'Story' },
          ],
        })
      )
    ).rejects.toThrowError(/Tag not-a-real-tag is not in the world tag vocabulary/);

    const listed = await worldState.world.listEntities({ minProminence: 'forgotten' });
    expect(listed).toHaveLength(0);
  });

  it('rejects a constrained relationship outside its declared kinds', async () => {
    await expect(
      worldState.world.commitBatch(
        proposal({
          entities: [
            { kind: 'npc', name: 'Fighter', ref: 'npc', status: 'alive', subkind: 'specialist' },
            { kind: 'geographic_location', name: 'The Shear', ref: 'place', status: 'hazardous', subkind: 'hazardous_zone' },
          ],
          relationships: [
            { dst: { ref: 'place' }, relationship: 'fought_over', src: { ref: 'npc' } },
          ],
        })
      )
    ).rejects.toThrowError(/fought_over is not allowed from npc to geographic_location/);
  });

  it('rejects the banned generic verb by name', async () => {
    await expect(
      worldState.world.commitBatch(
        proposal({
          entities: [
            { kind: 'geographic_location', name: 'Somewhere', ref: 'a', subkind: 'settlement' },
            { kind: 'geographic_location', name: 'Elsewhere', ref: 'b', subkind: 'settlement' },
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
          entities: [{ kind: 'npc', name: 'Solitary', ref: 'npc', status: 'alive', subkind: 'specialist' }],
          relationships: [
            { dst: { ref: 'nobody' }, relationship: 'cooperates_with', src: { ref: 'npc' } },
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
            // 'star_system' is a real subkind, just not one an npc may take.
            { kind: 'npc', name: 'One', ref: 'one', subkind: 'star_system' },
          ],
          lore: [
            { entity: { ref: 'one' }, prose: 'A story.', tags: ['not-a-real-tag'], title: 'Story' },
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
          { kind: 'geographic_location', name: 'Lore Root', ref: 'root', subkind: 'settlement' },
        ],
        lore: [
          {
            entity: { ref: 'root' },
            prose: 'An old story about the root.',
            tags: ['legend', 'origin'],
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
    expect(listed[0]?.tags).toEqual(['legend', 'origin']);
  });

  it('returns fragments for several entities in one query', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          { kind: 'geographic_location', name: 'First', ref: 'a', subkind: 'settlement' },
          { kind: 'geographic_location', name: 'Second', ref: 'b', subkind: 'settlement' },
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
