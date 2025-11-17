import type {
  Character,
  LocationNeighborSummary,
  LocationSummary,
  WorldStateStoreV2,
} from '@glass-frontier/worldstate';
import { describe, expect, it, vi } from 'vitest';

import {
  buildPlannerContext,
  buildPromptInput,
  resolveDecision,
  type DeltaDecision,
} from '../locationDeltaPlanner';

const mockNeighbor = (input: {
  placeId: string;
  name: string;
  relationKind: LocationNeighborSummary['relationKind'];
}): LocationNeighborSummary => ({
  locationId: 'loc-1',
  placeId: input.placeId,
  relationKind: input.relationKind,
  depth: 0,
  name: input.name,
  breadcrumb: [
    { id: 'root', kind: 'locale', name: 'Root' },
    { id: input.placeId, kind: 'locale', name: input.name },
  ],
  tags: [],
});

const createStore = (neighbors: {
  contains?: LocationNeighborSummary[];
  adjacent?: LocationNeighborSummary[];
  links?: LocationNeighborSummary[];
}): WorldStateStoreV2 => ({
  listLocationNeighbors: vi.fn(async (_loc, _place, options) => {
    const kinds = options?.relationKinds ?? [];
    if (kinds.includes('CONTAINS')) {
      return { items: neighbors.contains ?? [], nextCursor: null };
    }
    if (kinds.includes('ADJACENT_TO')) {
      return { items: neighbors.adjacent ?? [], nextCursor: null };
    }
    return { items: neighbors.links ?? [], nextCursor: null };
  }),
  getLocation: vi.fn(),
} as unknown as WorldStateStoreV2);

const character: Character = {
  id: 'char-1',
  loginId: 'login-1',
  name: 'Hero',
  pronouns: 'they/them',
  archetype: 'Recon',
  bio: '',
  tags: [],
  status: 'active',
  metadata: {},
  attributes: {
    resolve: 'rook',
    cunning: 'rook',
    vigor: 'rook',
    focus: 'rook',
    heart: 'rook',
  },
  skills: {},
  momentum: { current: 0, floor: -2, ceiling: 2 },
  inventory: { carried: [], stored: [], equipped: {}, capacity: 10 },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  locationState: {
    characterId: 'char-1',
    locationId: 'loc-1',
    placeId: 'mid',
    breadcrumb: [
      { id: 'root', kind: 'locale', name: 'Root' },
      { id: 'mid', kind: 'locale', name: 'Anchor' },
    ],
    certainty: 1,
    updatedAt: new Date().toISOString(),
  },
  echoes: [],
};

const locationSummary: LocationSummary = {
  id: 'loc-1',
  loginId: 'login-1',
  chronicleId: 'chron-1',
  name: 'Root',
  anchorPlaceId: 'root',
  breadcrumb: [{ id: 'root', kind: 'locale', name: 'Root' }],
  description: 'test',
  status: [],
  tags: [],
  nodeCount: 1,
  edgeCount: 0,
  graphChunkCount: 0,
};

describe('locationDeltaPlanner (v2)', () => {
  it('builds prompt input using neighbor buckets', async () => {
    const store = createStore({
      contains: [mockNeighbor({ placeId: 'child', name: 'Workshop', relationKind: 'CONTAINS' })],
      adjacent: [mockNeighbor({ placeId: 'adj', name: 'Dock', relationKind: 'ADJACENT_TO' })],
      links: [mockNeighbor({ placeId: 'link', name: 'Lift', relationKind: 'LINKS_TO' })],
    });
    const planner = await buildPlannerContext({
      store,
      character,
      locationSummary,
      locationId: 'loc-1',
    });
    expect(planner).not.toBeNull();
    const prompt = buildPromptInput(planner!, 'GM response', 'Player intent');
    expect(prompt.current).toBe('Anchor');
    expect(prompt.parent).toBe('Root');
    expect(prompt.children).toContain('Workshop');
    expect(prompt.adjacent).toContain('Dock');
    expect(prompt.links).toContain('Lift');
  });

  it('resolves move decisions for known neighbors', async () => {
    const target = mockNeighbor({
      placeId: 'child',
      name: 'Workshop',
      relationKind: 'CONTAINS',
    });
    const store = createStore({ contains: [target] });
    const planner = await buildPlannerContext({
      store,
      character,
      locationSummary,
      locationId: 'loc-1',
    });
    expect(planner).not.toBeNull();
    const resolution = resolveDecision(planner!, {
      action: 'move',
      destination: 'Workshop',
      link: 'inside',
    });
    expect(resolution.kind).toBe('move');
    if (resolution.kind === 'move') {
      expect(resolution.target.placeId).toBe('child');
    }
  });

  it('requests creation when destination is unknown', async () => {
    const store = createStore({ contains: [] });
    const planner = await buildPlannerContext({
      store,
      character,
      locationSummary,
      locationId: 'loc-1',
    });
    expect(planner).not.toBeNull();
    const decision: DeltaDecision = {
      action: 'move',
      destination: 'Unknown Space',
      link: 'adjacent',
    };
    const resolution = resolveDecision(planner!, decision);
    expect(resolution.kind).toBe('create');
    if (resolution.kind === 'create') {
      expect(resolution.destination).toBe('Unknown Space');
      expect(resolution.link).toBe('adjacent');
    }
  });
});
