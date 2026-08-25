import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ProposalRejected } from '../src/canonValidation';
import type { WorldState } from '../src/worldState';
import { proposal, resetDatabase, seedEntity, startHarness } from './harness';

let pool: Pool;
let worldState: WorldState;

const ACCORD_KEY = 'tsonu:accord';
const CAROM_KEY = 'tsonu:carom';
const DRIFT_WITNESS_NAME = 'Drift Witness';
const FAE_BIOLOGY_KEY = 'tsonu:fae:biology';
const FRESH_SIGNAL_TITLE = 'Fresh Signal';
const GNOMES_BIOLOGY_KEY = 'tsonu:gnomes:biology';
const IMPORT_V1_SOURCE_ID = 'tsonu-canon@v1';
const IMPORT_V2_SOURCE_ID = 'tsonu-canon@v2';
const OLDER_SIGNAL_NAME = 'Older Signal';
const PLAYER_RECORD_TITLE = 'A Player Record';
const RECENT_ACTIVITY_ARTIFACT_KIND = 'artifact' as const;

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
      live: true,
      relationship: 'member_of',
      strength: 0.7,
      targetId: faction?.id,
    });
    expect(faction?.links).toContainEqual({
      direction: 'in',
      live: true,
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

  it('stores canon selection metadata and returns only eligible one-hop focus choices', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          {
            kind: 'installation',
            name: 'Fourth Bell House',
            originBlurb: 'Raised among the bell keepers.',
            playableAs: ['chronicle_location', 'homeland'],
            ref: 'location',
            subkind: 'settlement',
          },
          {
            kind: 'npc',
            name: 'Aven Campus',
            ref: 'focus',
            subkind: 'specialist',
            veiled: true,
            veilTagline: 'Aven Campus restores old bell scores beneath Fourth Bell House.',
          },
          {
            isLocation: true,
            kind: 'installation',
            name: 'Bell Annex',
            ref: 'annex',
            subkind: 'settlement',
          },
          {
            kind: 'resource',
            name: 'Bell Salve',
            ref: 'medicine',
            subkind: 'medicine',
          },
          {
            kind: 'resource',
            name: 'Bell Bronze',
            ref: 'material',
            subkind: 'material',
          },
          {
            kind: 'npc',
            name: 'Forgotten Keeper',
            prominence: 'forgotten',
            ref: 'forgotten',
            subkind: 'specialist',
          },
          { kind: 'npc', name: 'Former Keeper', ref: 'ended', subkind: 'specialist' },
          {
            isArticle: true,
            kind: 'concept',
            name: 'Bell Keeping',
            ref: 'article',
            subkind: 'reference_concept',
          },
          { dm: true, kind: 'npc', name: 'Hidden Keeper', ref: 'dm', subkind: 'specialist' },
          { kind: 'era', name: 'Bell Years', ref: 'era', subkind: 'historical_period' },
        ],
        relationships: [
          { dst: { ref: 'location' }, live: true, relationship: 'operates_in', src: { ref: 'focus' } },
          { dst: { ref: 'location' }, live: true, relationship: 'located_in', src: { ref: 'annex' } },
          { dst: { ref: 'location' }, live: true, relationship: 'located_in', src: { ref: 'medicine' } },
          { dst: { ref: 'location' }, live: true, relationship: 'located_in', src: { ref: 'material' } },
          { dst: { ref: 'location' }, live: true, relationship: 'operates_in', src: { ref: 'forgotten' } },
          { dst: { ref: 'location' }, live: false, relationship: 'operates_in', src: { ref: 'ended' } },
          { dst: { ref: 'location' }, live: true, relationship: 'embeds', src: { ref: 'article' } },
          { dst: { ref: 'location' }, live: true, relationship: 'operates_in', src: { ref: 'dm' } },
          { dst: { ref: 'era' }, live: true, relationship: 'active_during', src: { ref: 'location' } },
        ],
      })
    );

    const location = await worldState.world.getEntity({ id: result.entityIdsByRef.location });
    expect(location).toMatchObject({
      dm: false,
      isArticle: false,
      originBlurb: 'Raised among the bell keepers.',
      playableAs: ['chronicle_location', 'homeland'],
      veiled: false,
    });

    const homelands = await worldState.world.listEntities({ playableAs: 'homeland' });
    expect(homelands.map((entity) => entity.id)).toEqual([result.entityIdsByRef.location]);

    const choices = await worldState.world.listFocusChoices({
      locationId: result.entityIdsByRef.location,
    });
    expect(new Set(choices.map((entity) => entity.id))).toEqual(new Set([
      result.entityIdsByRef.annex,
      result.entityIdsByRef.focus,
      result.entityIdsByRef.medicine,
    ]));
    expect(choices.find((entity) => entity.id === result.entityIdsByRef.focus)).toMatchObject({
      veiled: true,
      veilTagline: 'Aven Campus restores old bell scores beneath Fourth Bell House.',
    });
    expect(choices.find((entity) => entity.id === result.entityIdsByRef.annex)).toMatchObject({
      isLocation: true,
    });
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

  it('stores descriptive identity on entities and relationships and reads it back', async () => {
    const sourceKey = 'tsonu:dwarves-test';
    const appearance = 'Compact and heavy-jointed.';
    const expression = 'Answers without instruments.';
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          {
            descriptiveIdentity: { appearance },
            externalKey: sourceKey,
            identityProvenance: {
              appearance: [
                {
                  key: 'appearance',
                  operation: 'extend',
                  sourceExternalKey: sourceKey,
                  sourceKey: 'appearance',
                  sourceSlot: 'species',
                  suppressed: false,
                  text: appearance,
                },
              ],
            },
            identitySources: [{ slot: 'species', sourceExternalKey: sourceKey, via: 'direct' }],
            kind: 'npc',
            name: 'Orr',
            ref: 'npc',
            subkind: 'specialist',
          },
          { kind: 'concept', name: 'Resonance Field', ref: 'field' },
        ],
        relationships: [
          {
            descriptiveIdentity: { expression },
            dst: { ref: 'field' },
            identityLocal: { expression: { operation: 'extend', text: expression } },
            relationship: 'attuned_to',
            src: { ref: 'npc' },
          },
        ],
      })
    );
    const npc = await worldState.world.getEntity({ id: result.entityIdsByRef.npc });

    expect(npc?.descriptiveIdentity).toEqual({ appearance });
    expect(npc?.identitySources).toEqual([
      { slot: 'species', sourceExternalKey: sourceKey, via: 'direct' },
    ]);
    expect(npc?.identityProvenance?.appearance?.[0]).toMatchObject({
      sourceSlot: 'species',
      suppressed: false,
    });
    const link = npc?.links.find((each) => each.relationship === 'attuned_to');
    expect(link?.descriptiveIdentity).toEqual({ expression });
    expect(link?.identityLocal).toEqual({ expression: { operation: 'extend', text: expression } });
    expect(link?.props).toBeUndefined();

    const among = await worldState.world.listRelationshipsAmong({
      entityIds: [result.entityIdsByRef.npc, result.entityIdsByRef.field],
    });
    expect(among).toHaveLength(1);
    expect(among[0]).toMatchObject({
      descriptiveIdentity: { expression },
      dstId: result.entityIdsByRef.field,
      relationship: 'attuned_to',
      srcId: result.entityIdsByRef.npc,
    });
    const bounded = await worldState.world.listRelationshipsAmong({
      entityIds: [result.entityIdsByRef.npc],
    });
    expect(bounded).toHaveLength(0);
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

  it('retains lore slugs when a later import inserts another matching title', async () => {
    const entity = {
      externalKey: 'tsonu:species-notes',
      kind: 'concept' as const,
      name: 'Species Notes',
      ref: 'notes',
      subkind: 'reference_concept' as const,
    };
    await worldState.world.commitBatch(proposal({
      entities: [entity],
      lore: [
        { entity: { ref: 'notes' }, externalKey: FAE_BIOLOGY_KEY, prose: 'Fae biology.', title: 'Biology' },
        { entity: { ref: 'notes' }, externalKey: GNOMES_BIOLOGY_KEY, prose: 'Gnomish biology.', title: 'Biology' },
      ],
      source: 'import',
      sourceId: IMPORT_V1_SOURCE_ID,
    }));

    await worldState.world.commitBatch(proposal({
      entities: [entity],
      lore: [
        { entity: { ref: 'notes' }, externalKey: 'tsonu:dwarves:biology', prose: 'Dwarven biology.', title: 'Biology' },
        { entity: { ref: 'notes' }, externalKey: FAE_BIOLOGY_KEY, prose: 'Fae biology revised.', title: 'Biology' },
        { entity: { ref: 'notes' }, externalKey: GNOMES_BIOLOGY_KEY, prose: 'Gnomish biology revised.', title: 'Biology' },
      ],
      source: 'import',
      sourceId: IMPORT_V2_SOURCE_ID,
    }));

    const lore = await pool.query<{ external_key: string; slug: string }>(
      `SELECT external_key, slug FROM lore_fragment
       WHERE external_key LIKE 'tsonu:%:biology' ORDER BY external_key`
    );
    expect(lore.rows).toEqual([
      { external_key: 'tsonu:dwarves:biology', slug: 'frag_biology_3' },
      { external_key: FAE_BIOLOGY_KEY, slug: 'frag_biology' },
      { external_key: GNOMES_BIOLOGY_KEY, slug: 'frag_biology_2' },
    ]);
  });

  it('removes omitted imported lore and relationships without deleting play records', async () => {
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
            entity: { ref: 'accord' },
            externalKey: 'tsonu:accord:main:0',
            prose: 'The Accord governs the surviving settlements.',
            title: 'The Accord',
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
        sourceId: IMPORT_V1_SOURCE_ID,
      })
    );

    await worldState.world.commitBatch(
      proposal({
        entities: [
          {
            kind: 'npc',
            name: DRIFT_WITNESS_NAME,
            ref: 'witness',
            subkind: 'specialist',
          },
        ],
        lore: [
          {
            entity: { id: initial.entityIdsByRef.accord },
            prose: 'A chronicle changed how the Accord is remembered.',
            title: PLAYER_RECORD_TITLE,
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
          {
            externalKey: CAROM_KEY,
            kind: 'geographic_location',
            name: 'Carom',
            subkind: 'celestial_body',
          },
        ],
        source: 'import',
        sourceId: IMPORT_V2_SOURCE_ID,
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
    const lore = await pool.query<{ source: string; title: string }>(
      'SELECT source, title FROM lore_fragment ORDER BY source, title'
    );
    const edge = await pool.query<{ count: string }>(
      'SELECT count(*) FROM edge WHERE source = $1',
      ['import']
    );
    const witness = await worldState.world.findEntitiesByName({ name: DRIFT_WITNESS_NAME });

    expect(importedEntities.rows).toEqual([
      {
        description: 'Changed by a later source revision.',
        external_key: ACCORD_KEY,
      },
      { description: null, external_key: CAROM_KEY },
    ]);
    expect(lore.rows).toEqual([{ source: 'play', title: PLAYER_RECORD_TITLE }]);
    expect(edge.rows[0]?.count).toBe('0');
    expect(witness).toHaveLength(1);
  });

  it('deletes imported entities omitted from a later snapshot and their dependent nodes', async () => {
    const initial = await worldState.world.commitBatch(
      proposal({
        entities: [
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
        source: 'import',
        sourceId: IMPORT_V1_SOURCE_ID,
      })
    );
    const play = await worldState.world.commitBatch(
      proposal({
        entities: [
          {
            kind: 'npc',
            name: DRIFT_WITNESS_NAME,
            ref: 'witness',
            subkind: 'specialist',
          },
        ],
        lore: [
          {
            entity: { id: initial.entityIdsByRef.carom },
            prose: 'A chronicle left its own record on Carom.',
            title: PLAYER_RECORD_TITLE,
          },
        ],
        source: 'play',
        sourceId: 'chronicle-closure-1',
      })
    );
    const removedNodeIds = await pool.query<{ id: string }>(
      `SELECT id FROM node
       WHERE id = $1::uuid
          OR id IN (SELECT id FROM lore_fragment WHERE entity_id = $1::uuid)`,
      [initial.entityIdsByRef.carom]
    );

    await worldState.world.commitBatch(
      proposal({
        source: 'import',
        sourceId: IMPORT_V2_SOURCE_ID,
      })
    );

    const remainingRemovedNodes = await pool.query<{ count: string }>(
      'SELECT count(*) FROM node WHERE id = ANY($1::uuid[])',
      [removedNodeIds.rows.map((row) => row.id)]
    );

    expect(await worldState.world.getEntity({ id: initial.entityIdsByRef.carom })).toBeNull();
    expect(await worldState.world.getEntity({ id: play.entityIdsByRef.witness })).not.toBeNull();
    expect(remainingRemovedNodes.rows[0]?.count).toBe('0');
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

  it('separates newly created entities from entities with later lore', async () => {
    const created = await worldState.world.commitBatch(
      proposal({
        entities: [
          {
            description: 'The older public entity.',
            kind: RECENT_ACTIVITY_ARTIFACT_KIND,
            name: OLDER_SIGNAL_NAME,
            ref: 'older',
            subkind: 'relic',
          },
          {
            description: 'The newer public entity.',
            kind: 'npc',
            name: 'New Arrival',
            ref: 'newer',
            subkind: 'specialist',
          },
          {
            dm: true,
            kind: RECENT_ACTIVITY_ARTIFACT_KIND,
            name: 'Hidden Instrument',
            ref: 'hidden',
          },
          {
            isArticle: true,
            kind: RECENT_ACTIVITY_ARTIFACT_KIND,
            name: 'Reference Entry',
            ref: 'article',
          },
        ],
        lore: [
          {
            entity: { ref: 'older' },
            prose: 'This lore arrived with the entity.',
            title: 'Founding Record',
          },
        ],
      })
    );
    await worldState.world.commitBatch(
      proposal({
        lore: [
          {
            entity: { id: created.entityIdsByRef.older },
            prose: 'A fresh signal crossed the frontier.',
            title: FRESH_SIGNAL_TITLE,
          },
          {
            entity: { id: created.entityIdsByRef.hidden },
            prose: 'Players must not see this.',
            title: 'Hidden Signal',
          },
          {
            entity: { id: created.entityIdsByRef.article },
            prose: 'Reference pages stay out of entity activity.',
            title: 'Reference Update',
          },
        ],
      })
    );

    await Promise.all([
      pool.query('UPDATE entity SET created_at = $2 WHERE id = $1::uuid', [
        created.entityIdsByRef.older,
        '2026-08-20T00:00:00Z',
      ]),
      pool.query('UPDATE entity SET created_at = $2 WHERE id = $1::uuid', [
        created.entityIdsByRef.newer,
        '2026-08-21T00:00:00Z',
      ]),
      pool.query('UPDATE lore_fragment SET created_at = $2 WHERE title = $1', [
        'Founding Record',
        '2026-08-20T00:00:00Z',
      ]),
      pool.query('UPDATE lore_fragment SET created_at = $2 WHERE title = $1', [
        FRESH_SIGNAL_TITLE,
        '2026-08-22T00:00:00Z',
      ]),
    ]);

    const activity = await worldState.world.getEntityActivity(2);

    expect(activity.created.map((entity) => entity.name)).toEqual([
      'New Arrival',
      OLDER_SIGNAL_NAME,
    ]);
    expect(activity.loreUpdated).toEqual([
      {
        activityAt: Date.parse('2026-08-22T00:00:00Z'),
        id: created.entityIdsByRef.older,
        kind: RECENT_ACTIVITY_ARTIFACT_KIND,
        loreTitle: FRESH_SIGNAL_TITLE,
        name: OLDER_SIGNAL_NAME,
        slug: 'older_signal',
        subkind: 'relic',
        summary: 'A fresh signal crossed the frontier.',
      },
    ]);
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
