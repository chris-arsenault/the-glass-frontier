import { HardState, LoreFragment } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { entityView, identityView, plainProse } from '../src/promptContext/promptViews';

/**
 * Shaped after `tsonu:dovra` as the canon bundle actually publishes it: a short
 * description, a fact card, three GM notes, three descriptive-identity keys,
 * and lore prose carrying Atlas links.
 */
const dovra = (): HardState =>
  HardState.parse({
    description: 'Dovra is a low tidal river country on Korvath.',
    descriptiveIdentity: {
      activity: 'Family channel barges run cargo to [Lowbank](/glass-frontier/entry/lowbank).',
      hazards: 'A chart a few seasons old routes through channels that are now orchards.',
      setting: 'Low tidal river country on Korvath’s middle sea.',
    },
    facts: { present_here: 'Reedwater People' },
    gmNotes: [
      { kind: 'appears', text: 'Every water board sounds its own registered gate interval.' },
      { kind: 'triggered_by', text: 'Directions in Dovra go stale.' },
      { kind: 'complicates', text: 'A sealed transit tally settles the route and nothing else.' },
    ],
    id: 'entity-dovra',
    kind: 'geographic_location',
    name: 'Dovra',
    slug: 'dovra',
    status: 'active',
    subkind: 'region',
  });

const fragment = (title: string, prose: string): LoreFragment =>
  LoreFragment.parse({
    entityId: 'entity-dovra',
    entitySlug: 'dovra',
    id: `lore-${title}`,
    prose,
    slug: title,
    source: {},
    title,
  });

describe('entityView', () => {
  it('carries the descriptive identity, stripped of Atlas links', () => {
    const view = entityView(dovra(), []);
    expect(view.descriptiveIdentity).toEqual({
      activity: 'Family channel barges run cargo to Lowbank.',
      hazards: 'A chart a few seasons old routes through channels that are now orchards.',
      setting: 'Low tidal river country on Korvath’s middle sea.',
    });
  });

  it('caps GM notes at two and keeps their kinds', () => {
    const view = entityView(dovra(), []);
    expect(view.gmNotes.map((note) => note.kind)).toEqual(['appears', 'triggered_by']);
  });

  it('summarizes lore to its first sentence and caps the count', () => {
    const lore = [
      fragment('one', 'The reed roll is a tally. It also names the pilot who carried it.'),
      fragment('two', 'Second fragment.'),
      fragment('three', 'Third fragment.'),
      fragment('four', 'Fourth fragment.'),
    ];
    const view = entityView(dovra(), lore);
    expect(view.lore).toEqual([
      { summary: 'The reed roll is a tally.', title: 'one' },
      { summary: 'Second fragment.', title: 'two' },
      { summary: 'Third fragment.', title: 'three' },
    ]);
  });

  it('leaves the identity absent when the canon resolved none', () => {
    const entity = HardState.parse({
      id: 'entity-bare',
      kind: 'npc',
      name: 'Hundson',
      slug: 'hundson',
    });
    expect(entityView(entity, []).descriptiveIdentity).toBeUndefined();
    expect(entityView(entity, []).gmNotes).toEqual([]);
  });
});

describe('identityView', () => {
  it('returns undefined rather than an empty record for absent identity', () => {
    expect(identityView(undefined)).toBeUndefined();
  });
});

describe('plainProse', () => {
  it('keeps the link text and drops the route', () => {
    expect(plainProse('the port of [Lowbank](/glass-frontier/entry/lowbank) is closed')).toBe(
      'the port of Lowbank is closed'
    );
  });
});
