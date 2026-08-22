import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ProposalRejected } from '../src/canonValidation';
import type { WorldState } from '../src/worldState';
import { proposal, resetDatabase, seedEntity, startHarness } from './harness';

let pool: Pool;
let worldState: WorldState;

const ACCORD_KEY = 'tsonu:accord';
const CAROM_KEY = 'tsonu:carom';

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
  it('starts tests without loading the production canon artifact', async () => {
    const imported = await pool.query<{ count: string }>(
      'SELECT count(*) FROM entity WHERE source = $1',
      ['import']
    );

    expect(imported.rows[0]?.count).toBe('0');
  });

  it('resolves relationships between entities created in the same batch', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          {
            kind: 'faction',
            name: 'Glass Wardens',
            ref: 'faction',
            status: 'active',
            subkind: 'religious_order',
          },
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
          {
            kind: 'geographic_location',
            name: 'Quay',
            ref: 'a',
            status: 'charted',
            subkind: 'region',
          },
          {
            kind: 'geographic_location',
            name: 'Wharf',
            ref: 'b',
            status: 'charted',
            subkind: 'region',
          },
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
          {
            kind: 'creature',
            name: 'Marrower',
            ref: 'creature',
            status: 'alive',
            subkind: 'animal',
          },
          {
            kind: 'installation',
            name: 'Orra',
            ref: 'hab',
            status: 'inhabited',
            subkind: 'settlement',
          },
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
          {
            isLocation: true,
            kind: 'transport',
            name: 'The Long Answer',
            ref: 'ship',
            subkind: 'vessel',
          },
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
    expect(places.map((entity) => entity.name).sort()).toEqual(['Five Landing', 'The Long Answer']);
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
    const all = await worldState.world.listEntities({
      kind: 'geographic_location',
      minProminence: 'forgotten',
    });
    expect(all).toHaveLength(1);
    expect(all[0]?.status).toBe('ruined');
    expect(all[0]?.description).toBe('Now with a description.');
  });

  it('applies partial imports without deleting omitted rows or overwriting play changes', async () => {
    const initial = await worldState.world.commitBatch(
      proposal({
        entities: [
          {
            externalKey: ACCORD_KEY,
            kind: 'faction',
            name: 'Tempered Accord',
            ref: 'accord',
            subkind: 'government',
          },
          {
            externalKey: CAROM_KEY,
            kind: 'geographic_location',
            name: 'Carom',
            ref: 'carom',
            subkind: 'celestial_body',
          },
        ],
        lore: [
          {
            entity: { ref: 'carom' },
            externalKey: 'tsonu:carom:main:0',
            prose: 'Carom holds the surviving settlements.',
            title: 'Carom',
          },
        ],
        relationships: [
          {
            dst: { ref: 'carom' },
            relationship: 'governs',
            src: { ref: 'accord' },
            strength: 0.6,
          },
        ],
        source: 'import',
        sourceId: 'tsonu-canon@v1',
      })
    );

    await worldState.world.commitBatch(
      proposal({
        relationships: [
          {
            dst: { id: initial.entityIdsByRef.carom },
            relationship: 'governs',
            src: { id: initial.entityIdsByRef.accord },
            strength: 0.9,
          },
        ],
        source: 'play',
        sourceId: 'chronicle-closure-1',
      })
    );

    await worldState.world.commitBatch(
      proposal({
        entities: [
          {
            description: 'Changed by a later source revision.',
            externalKey: ACCORD_KEY,
            kind: 'faction',
            name: 'Tempered Accord',
            subkind: 'government',
          },
        ],
        source: 'import',
        sourceId: 'tsonu-canon@v2',
      })
    );
    await worldState.world.commitBatch(
      proposal({
        relationships: [
          {
            dst: { externalKey: CAROM_KEY },
            relationship: 'governs',
            src: { externalKey: ACCORD_KEY },
            strength: 0.2,
          },
        ],
        source: 'import',
        sourceId: 'tsonu-canon@v3',
      })
    );

    const importedEntities = await pool.query<{
      description: string | null;
      external_key: string;
    }>(
      `SELECT external_key, description
       FROM entity
       WHERE source = 'import'
       ORDER BY external_key`
    );
    const lore = await pool.query<{ count: string }>(
      'SELECT count(*) FROM lore_fragment WHERE source = $1',
      ['import']
    );
    const edge = await pool.query<{ source: string; strength: number }>(
      `SELECT source, strength
       FROM edge
       WHERE src_id = $1::uuid AND dst_id = $2::uuid AND type = 'governs'`,
      [initial.entityIdsByRef.accord, initial.entityIdsByRef.carom]
    );

    expect(importedEntities.rows).toEqual([
      {
        description: 'Changed by a later source revision.',
        external_key: ACCORD_KEY,
      },
      { description: null, external_key: CAROM_KEY },
    ]);
    expect(lore.rows[0]?.count).toBe('1');
    expect(edge.rows[0]).toEqual({ source: 'play', strength: 0.9 });
  });

  it('gives colliding names a counted suffix, not a random one', async () => {
    await seedEntity(worldState, {
      kind: 'geographic_location',
      name: 'Grey Harbor',
      subkind: 'settlement',
    });
    await seedEntity(worldState, {
      kind: 'geographic_location',
      name: 'Grey Harbor',
      subkind: 'settlement',
    });
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
          {
            kind: 'faction',
            name: 'Ash Cartel',
            ref: 'faction',
            status: 'active',
            subkind: 'company',
          },
          {
            kind: 'geographic_location',
            name: 'Cinder Row',
            ref: 'place',
            status: 'inhabited',
            subkind: 'region',
          },
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
    const edges = await pool.query('SELECT 1 FROM edge WHERE batch_id = $1::uuid', [
      result.batchId,
    ]);
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
            {
              kind: 'geographic_location',
              name: 'The Shear',
              ref: 'place',
              status: 'hazardous',
              subkind: 'hazardous_zone',
            },
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
          entities: [
            { kind: 'npc', name: 'Solitary', ref: 'npc', status: 'alive', subkind: 'specialist' },
          ],
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

describe('Closure support queries', () => {
  it('finds entities by name across kinds, most prominent first', async () => {
    await worldState.world.commitBatch(
      proposal({
        entities: [
          { kind: 'npc', name: 'The Warden', prominence: 'marginal', subkind: 'official' },
          { kind: 'faction', name: 'the warden', prominence: 'renowned' },
          { kind: 'npc', name: 'Someone Else', subkind: 'worker' },
        ],
      })
    );

    const matches = await worldState.world.findEntitiesByName({ name: ' The Warden ' });

    expect(matches.map((entity) => entity.kind)).toEqual(['faction', 'npc']);
  });

  it('reports source, lore, and edge counts per entity', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          { kind: 'npc', name: 'Counted', ref: 'subject', subkind: 'specialist' },
          { kind: 'faction', name: 'Counters', ref: 'others' },
        ],
        lore: [
          { entity: { ref: 'subject' }, prose: 'First tale.', title: 'One' },
          { entity: { ref: 'subject' }, prose: 'Second tale.', title: 'Two' },
        ],
        relationships: [
          { dst: { ref: 'others' }, relationship: 'member_of', src: { ref: 'subject' } },
        ],
        source: 'play',
      })
    );

    const stats = await worldState.world.listEntityStats([
      result.entityIdsByRef.subject,
      result.entityIdsByRef.others,
    ]);
    const subject = stats.find((entry) => entry.id === result.entityIdsByRef.subject);
    const others = stats.find((entry) => entry.id === result.entityIdsByRef.others);

    expect(subject).toEqual({
      edgeCount: 1,
      id: result.entityIdsByRef.subject,
      loreCount: 2,
      source: 'play',
    });
    expect(others).toEqual({
      edgeCount: 1,
      id: result.entityIdsByRef.others,
      loreCount: 0,
      source: 'play',
    });
  });

  it('finds the most recent batch for a source and sourceId', async () => {
    await worldState.world.commitBatch(
      proposal({
        entities: [{ kind: 'npc', name: 'Batched', subkind: 'courier' }],
        source: 'play',
        sourceId: 'chronicle-1',
      })
    );

    const found = await worldState.world.findBatch({
      source: 'play',
      sourceId: 'chronicle-1',
    });
    const missing = await worldState.world.findBatch({
      source: 'play',
      sourceId: 'chronicle-2',
    });

    expect(found).not.toBeNull();
    expect(missing).toBeNull();
  });
});
