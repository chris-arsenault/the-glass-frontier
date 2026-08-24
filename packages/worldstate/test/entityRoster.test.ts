import type { ContextSliceEntity, ContextSliceInput } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { isEntityOfferable } from '../src/entityOfferability';
import {
  buildInitialEntityRoster,
  curateEntityRoster,
} from '../src/entityRoster';
import type { WorldSchemaStore } from '../src/types';

const LOCATION_ID = '11111111-1111-4111-8111-111111111111';
const ANCHOR_ID = '22222222-2222-4222-8222-222222222222';

const entity = (
  id: string,
  name: string,
  options: Partial<ContextSliceEntity> = {}
): ContextSliceEntity => ({
  facts: {},
  gmNotes: [],
  hops: 0,
  id,
  kind: 'geographic_location',
  lore: [],
  name,
  prominence: 'recognized',
  reach: 1,
  score: 1,
  slug: name.toLowerCase().replaceAll(' ', '-'),
  status: 'known',
  subkind: 'settlement',
  tags: [],
  unwritten: false,
  ...options,
});

describe('buildInitialEntityRoster', () => {
  it('requests local canon and returns only public roster fields', async () => {
    let request: ContextSliceInput | undefined;
    const store: Pick<WorldSchemaStore, 'getContextSlice'> = {
      getContextSlice: (input) => {
        request = input;
        return Promise.resolve([
          entity(LOCATION_ID, 'Glass Harbor', {
            gmNotes: [{ kind: 'appears' as const, text: 'The watch arrives after loud noises.' }],
          }),
          entity(ANCHOR_ID, 'The Ferryman'),
        ]);
      },
    };

    const roster = await buildInitialEntityRoster(store, {
      anchorId: ANCHOR_ID,
      locationId: LOCATION_ID,
      locationName: 'Glass Harbor',
    });

    expect(request).toMatchObject({
      anchorId: ANCHOR_ID,
      focusIds: [LOCATION_ID, ANCHOR_ID],
      limit: 50,
      loreLimit: 0,
    });
    expect(roster.entries).toEqual([
      expect.objectContaining({ availability: ['anchor'], id: ANCHOR_ID }),
      expect.objectContaining({ availability: ['location'], id: LOCATION_ID }),
    ]);
    expect(roster.entries[0]).not.toHaveProperty('gmNotes');
  });

  it('excludes article-like kinds from the proactive roster', () => {
    const entries = [
      entity('species', 'Humans', {
        kind: 'species', prominence: 'mythic', score: 20, subkind: 'sapient_species',
      }),
      entity('history', 'The Signal Famine', {
        kind: 'era', prominence: 'mythic', score: 19, subkind: 'historical_period',
      }),
      entity('world', 'The Glass Frontier', {
        kind: 'geographic_location', prominence: 'mythic', score: 18, subkind: 'world_region',
      }),
      entity('material', 'Ringglass', {
        kind: 'resource', prominence: 'mythic', score: 17, subkind: 'material',
      }),
      entity('forgotten-person', 'Forgotten Person', {
        kind: 'npc', prominence: 'forgotten', score: 16, subkind: 'worker',
      }),
      entity('person', 'K Vara', { kind: 'npc', score: 1, subkind: 'worker' }),
    ];

    expect(entries.filter(isEntityOfferable).map((entry) => entry.name)).toEqual(['K Vara']);
  });

  it('includes incidents and rumors as actionable story hooks', () => {
    const incident = entity('incident', 'Dock Nine Fire', {
      kind: 'incident', subkind: 'operational_failure',
    });
    const rumor = entity('rumor', 'The Captain Took a Bribe', { kind: 'rumor', subkind: undefined });

    expect([incident, rumor].every(isEntityOfferable)).toBe(true);
  });

  it('includes specific places and usable resources', () => {
    const settlement = entity('settlement', 'Bell Hollow', {
      kind: 'geographic_location', subkind: 'settlement',
    });
    const medicine = entity('medicine', 'Blue Salve', {
      kind: 'resource', subkind: 'medicine',
    });

    expect([settlement, medicine].every(isEntityOfferable)).toBe(true);
  });

  it('prioritizes scene and recent entities without requiring co-location', () => {
    const local = entity('local', 'Local Storehouse', {
      kind: 'installation', score: 10, subkind: 'warehouse',
    });
    const sceneSubject = entity('subject', 'Captain Venn', {
      kind: 'npc', score: 1, subkind: 'official',
    });
    const recentFaction = entity('faction', 'Far-Ring Couriers', {
      kind: 'faction', score: 0.5, subkind: 'trade_network',
    });

    const roster = curateEntityRoster([local, sceneSubject, recentFaction], {
      locationId: 'somewhere-else',
      recentIds: [recentFaction.id],
      sceneSubjectId: sceneSubject.id,
    });

    expect(roster.map((entry) => entry.id)).toEqual([
      recentFaction.id,
      sceneSubject.id,
      local.id,
    ]);
  });

  it('seats at most two unwritten shells however well they score', () => {
    const shells = [5, 4, 3, 2, 1].map((rank) =>
      entity(`shell-${rank}`, `Shell ${rank}`, {
        kind: 'npc', score: 100 + rank, subkind: 'worker', unwritten: true,
      })
    );
    const established = [3, 2, 1].map((rank) =>
      entity(`known-${rank}`, `Known ${rank}`, {
        kind: 'npc', score: rank, subkind: 'worker',
      })
    );

    const roster = curateEntityRoster([...shells, ...established], {});

    expect(roster.map((entry) => entry.id)).toEqual([
      'shell-5',
      'shell-4',
      'known-3',
      'known-2',
      'known-1',
    ]);
  });
});
