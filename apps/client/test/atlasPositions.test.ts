import type { HardState, HardStateLink, SpatialPosition } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { buildAtlasGraph } from '../src/components/atlas/atlasGraph';
import {
  AtlasPositionResolver,
  hasOwnPolarPosition,
  localOffset,
  surfacePoint,
} from '../src/components/atlas/atlasPositions';

const entity = (
  id: string,
  overrides: Partial<HardState> & { links?: HardStateLink[]; positions?: SpatialPosition[] } = {}
): HardState => ({
  createdAt: 0,
  dm: false,
  externalKey: `tsonu:${id}`,
  facts: {},
  id,
  identitySources: [],
  isArticle: false,
  isLocation: true,
  kind: 'geographic_location',
  links: [],
  name: id.replace(/_/g, ' '),
  playableAs: [],
  positions: [],
  prominence: 'recognized',
  slug: id,
  updatedAt: 0,
  veiled: false,
  ...overrides,
  contextTags: overrides.contextTags ?? [],
});

const out = (relationship: HardStateLink['relationship'], targetId: string): HardStateLink => ({
  direction: 'out',
  live: true,
  relationship,
  targetId,
});

const polar = (radius: number, angleDeg: number): SpatialPosition => ({
  coordinates: { angle_deg: angleDeg, radius },
  frameId: 'chart',
});

describe('AtlasPositionResolver', () => {
  const sun = entity('sun', { subkind: 'celestial_body' });
  const planet = entity('planet', {
    links: [out('orbits', 'sun')],
    positions: [polar(2, 60)],
    subkind: 'celestial_body',
  });
  const station = entity('station', {
    kind: 'installation',
    links: [out('in_orbit_of', 'planet')],
    positions: [
      {
        coordinates: { angle_offset_deg: 30, radial_offset: 0.5 },
        frameId: 'chart',
        relativeToId: 'tsonu:planet',
      },
    ],
    subkind: 'station',
  });
  const town = entity('town', {
    kind: 'installation',
    links: [out('located_in', 'planet')],
    positions: [
      {
        coordinates: { latitude_deg: 10, longitude_deg: -20, size_class: 'district' },
        frameId: 'planet_surface',
      },
    ],
    subkind: 'settlement',
  });

  const graph = buildAtlasGraph([sun, planet, station, town]);
  const resolver = new AtlasPositionResolver(graph);

  it('resolves absolute polar positions', () => {
    expect(resolver.resolvePolar('planet')).toEqual({ angleDeg: 60, radius: 2 });
  });

  it('treats relative positions as local vectors around the reference body', () => {
    // planet at (2, 60°); station 0.5 away at bearing 30°.
    const station30 = resolver.resolvePolar('station');
    expect(station30?.radius).toBeCloseTo(2.446, 3);
    expect(station30?.angleDeg).toBeCloseTo(54.13, 2);
  });

  it('collapses surface entities onto their spatial parent for polar use', () => {
    expect(resolver.resolvePolar('town')).toEqual({ angleDeg: 60, radius: 2 });
    expect(hasOwnPolarPosition(town)).toBe(false);
  });

  it('reads surface coordinates with their size class', () => {
    expect(surfacePoint(town)).toEqual({
      extentRadiusKm: undefined,
      latitudeDeg: 10,
      longitudeDeg: -20,
      sizeClass: 'district',
    });
    expect(surfacePoint(station)).toBeNull();
  });

  it('resolves route points through anchors and literals', () => {
    expect(
      resolver.resolveRoutePoint({ entityId: 'tsonu:planet', id: 'a', kind: 'anchor' })
    ).toEqual({ angleDeg: 60, radius: 2 });
    expect(
      resolver.resolveRoutePoint({
        coordinates: { angle_deg: 10, radius: 3 },
        id: 'p',
        kind: 'point',
      })
    ).toEqual({ angleDeg: 10, radius: 3 });
  });

  it('measures local offsets between polar points', () => {
    const offset = localOffset({ angleDeg: 0, radius: 2 }, { angleDeg: 0, radius: 2.5 });
    expect(offset.distance).toBeCloseTo(0.5);
    expect(offset.x).toBeCloseTo(0.5);
  });
});
