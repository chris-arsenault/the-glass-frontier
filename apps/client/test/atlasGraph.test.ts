import type { HardState, HardStateLink } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import {
  breadcrumbIds,
  buildAtlasGraph,
  descendantCount,
} from '../src/components/atlas/atlasGraph';

const entity = (
  id: string,
  overrides: Partial<HardState> & { links?: HardStateLink[] } = {}
): HardState => ({
  createdAt: 0,
  facts: {},
  id,
  isLocation: true,
  kind: 'geographic_location',
  links: [],
  name: id.replace(/_/g, ' '),
  prominence: 'recognized',
  slug: id,
  updatedAt: 0,
  ...overrides,
});

const out = (relationship: HardStateLink['relationship'], targetId: string): HardStateLink => ({
  direction: 'out',
  relationship,
  targetId,
});

describe('buildAtlasGraph', () => {
  const sun = entity('sun', { subkind: 'celestial_body' });
  const inner = entity('inner', {
    links: [out('orbits', 'sun'), out('inner_of', 'outer')],
    subkind: 'celestial_body',
  });
  const outer = entity('outer', { links: [out('orbits', 'sun')], subkind: 'celestial_body' });
  const moon = entity('moon', { links: [out('orbits', 'outer')], subkind: 'celestial_body' });
  const station = entity('station', {
    kind: 'installation',
    links: [out('in_orbit_of', 'outer')],
    subkind: 'station',
  });
  const region = entity('region', { links: [out('on_surface_of', 'outer')], subkind: 'region' });
  const settlement = entity('settlement', {
    kind: 'installation',
    links: [out('located_in', 'region')],
    subkind: 'settlement',
  });
  const system = entity('system', { subkind: 'star_system' });
  const stray = entity('stray');

  const graph = buildAtlasGraph([
    sun,
    inner,
    outer,
    moon,
    station,
    region,
    settlement,
    system,
    stray,
  ]);

  it('finds the sun and orders planets inner to outer', () => {
    expect(graph.sunId).toBe('sun');
    expect(graph.planetIds).toEqual(['inner', 'outer']);
    expect(graph.systemId).toBe('system');
  });

  it('buckets children by how they attach', () => {
    const outerNode = graph.nodes.get('outer');
    expect(outerNode?.children.orbit).toEqual(['moon', 'station']);
    expect(outerNode?.children.surface).toEqual(['region']);
    expect(graph.nodes.get('region')?.children.within).toEqual(['settlement']);
  });

  it('marks the most charted planet as home and counts descendants', () => {
    expect(graph.homeId).toBe('outer');
    expect(descendantCount(graph, 'outer')).toBe(4);
  });

  it('keeps parentless places as roots and walks breadcrumbs to them', () => {
    expect(graph.rootIds).toEqual(['stray']);
    expect(breadcrumbIds(graph, 'settlement')).toEqual(['sun', 'outer', 'region', 'settlement']);
  });

  it('breaks parent cycles instead of losing the subtree', () => {
    const a = entity('a', { links: [out('located_in', 'b')] });
    const b = entity('b', { links: [out('located_in', 'a')] });
    const cyclic = buildAtlasGraph([a, b]);
    const parents = [cyclic.nodes.get('a')?.parentId, cyclic.nodes.get('b')?.parentId];
    expect(parents.filter((parent) => parent === null)).toHaveLength(1);
    expect(cyclic.rootIds).toHaveLength(1);
  });
});
