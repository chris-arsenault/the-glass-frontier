import type { ContextSliceEntity, ContextSliceInput } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { buildInitialEntityRoster } from '../src/entityRoster';
import type { WorldSchemaStore } from '../src/types';

const LOCATION_ID = '11111111-1111-4111-8111-111111111111';
const ANCHOR_ID = '22222222-2222-4222-8222-222222222222';

const entity = (
  id: string,
  name: string,
  gmNotes: string[] = []
): ContextSliceEntity => ({
  facts: {},
  gmNotes,
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
});

describe('buildInitialEntityRoster', () => {
  it('requests local canon and returns only public roster fields', async () => {
    let request: ContextSliceInput | undefined;
    const store: Pick<WorldSchemaStore, 'getContextSlice'> = {
      getContextSlice: (input) => {
        request = input;
        return Promise.resolve([
          entity(LOCATION_ID, 'Glass Harbor', ['The watch arrives after loud noises.']),
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
      limit: 7,
      loreLimit: 0,
    });
    expect(roster.entries).toEqual([
      expect.objectContaining({ availability: ['location'], id: LOCATION_ID }),
      expect.objectContaining({ availability: ['anchor'], id: ANCHOR_ID }),
    ]);
    expect(roster.entries[0]).not.toHaveProperty('gmNotes');
  });
});
