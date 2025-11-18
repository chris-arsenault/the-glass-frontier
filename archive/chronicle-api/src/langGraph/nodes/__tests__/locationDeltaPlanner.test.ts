import type { LocationPlan, LocationPlace } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import {
  appendEdgesForExistingTarget,
  buildPlannerContext,
  buildPromptInput,
  normalizeName,
  resolveTargetReference,
  type DeltaDecision,
  type PlannerContext,
  isAncestor,
} from '../locationDeltaPlanner';

const createPlace = (input: {
  id: string;
  name: string;
  canonicalParentId?: string;
}): LocationPlace => ({
  canonicalParentId: input.canonicalParentId,
  createdAt: Date.now(),
  description: '',
  id: input.id,
  kind: 'locale',
  locationId: 'loc-1',
  name: input.name,
  tags: [],
  updatedAt: Date.now(),
});

const buildContext = (): PlannerContext => {
  const root = createPlace({ id: 'root', name: 'Luminous Quay' });
  const mid = createPlace({ id: 'mid', name: 'Auric Causeway', canonicalParentId: root.id });
  const leaf = createPlace({
    canonicalParentId: mid.id,
    id: 'leaf',
    name: 'Maintenance Bay',
  });
  const dock = createPlace({
    canonicalParentId: root.id,
    id: 'dock',
    name: 'Docking Ring',
  });
  const graph = {
    edges: [
      { dst: 'dock', kind: 'ADJACENT_TO', locationId: 'loc-1', metadata: {}, src: 'mid' },
      { dst: 'mid', kind: 'CONTAINS', locationId: 'loc-1', metadata: {}, src: 'root' },
    ],
    locationId: 'loc-1',
    places: [root, mid, leaf, dock],
  };
  const placeById = new Map([
    [root.id, root],
    [mid.id, mid],
    [leaf.id, leaf],
    [dock.id, dock],
  ]);
  const placeByName = new Map([
    [normalizeName(root.name), root],
    [normalizeName(mid.name), mid],
    [normalizeName(leaf.name), leaf],
    [normalizeName(dock.name), dock],
  ]);
  return {
    anchorPlace: leaf,
    characterId: 'char-1',
    chronicleId: 'chron-1',
    graph,
    parentPlace: mid,
    placeById,
    placeByName,
  };
};

describe('locationDeltaPlanner helpers', () => {
  describe('buildPlannerContext+buildPromptInput integration', () => {
    it('captures parent info for leaf anchors', () => {
      const base = buildContext();
      const context = buildPlannerContext({
        characterId: 'char-1',
        chronicleId: 'chron-1',
        graph: base.graph,
        locationId: 'loc-1',
        priorState: { anchorPlaceId: 'leaf', locationId: 'loc-1' },
      });
      expect(context).not.toBeNull();
      const prompt = buildPromptInput(context!, 'GM text', 'Player intent');
      expect(prompt.parent).toBe('Auric Causeway');
      expect(prompt.children).toEqual([]);
    });

    it('captures children and adjacency for interior anchors', () => {
      const base = buildContext();
      const context = buildPlannerContext({
        characterId: 'char-1',
        chronicleId: 'chron-1',
        graph: base.graph,
        locationId: 'loc-1',
        priorState: { anchorPlaceId: 'mid', locationId: 'loc-1' },
      });
      expect(context).not.toBeNull();
      const prompt = buildPromptInput(context!, 'GM text', 'Player intent');
      expect(prompt.parent).toBe('Luminous Quay');
      expect(prompt.children).toContain('Maintenance Bay');
      expect(prompt.adjacent).toContain('Docking Ring');
    });
  });

  describe('resolveTargetReference', () => {
    it('treats ancestor destinations as immediate without mutating ops', () => {
      const context = buildContext();
      const ops: LocationPlan['ops'] = [];
      const decision: DeltaDecision = {
        action: 'move',
        destination: 'Luminous Quay',
        link: 'same',
      };

      const result = resolveTargetReference({ context, decision, ops });

      expect(result).not.toBeNull();
      expect(result?.id).toBe('root');
      expect(result?.applyImmediately).toBe(true);
      expect(ops).toHaveLength(0);
    });

    it('adds adjacency edges when targeting a neighboring place', () => {
      const context = buildContext();
      const ops: LocationPlan['ops'] = [];
      const decision: DeltaDecision = {
        action: 'move',
        destination: 'Docking Ring',
        link: 'adjacent',
      };

      const result = resolveTargetReference({ context, decision, ops });

      expect(result).not.toBeNull();
      expect(result?.applyImmediately).toBe(false);
      expect(ops).toHaveLength(1);
      expect(ops[0]).toEqual({
        edge: { dst: 'dock', kind: 'ADJACENT_TO', src: 'leaf' },
        op: 'CREATE_EDGE',
      });
    });
  });

  describe('appendEdgesForExistingTarget', () => {
    it('creates containment edge from anchor when target is inside', () => {
      const context = buildContext();
      const ops: LocationPlan['ops'] = [];

      appendEdgesForExistingTarget({
        anchorId: context.anchorPlace.id,
        link: 'inside',
        ops,
        parentId: context.parentPlace?.id ?? context.anchorPlace.id,
        target: context.placeById.get('mid')!,
      });

      expect(ops).toEqual([
        {
          edge: { dst: 'mid', kind: 'CONTAINS', src: 'leaf' },
          op: 'CREATE_EDGE',
        },
      ]);
    });

    it('creates linked edges when destinations are connected structures', () => {
      const context = buildContext();
      const ops: LocationPlan['ops'] = [];

      appendEdgesForExistingTarget({
        anchorId: context.anchorPlace.id,
        link: 'linked',
        ops,
        parentId: context.parentPlace?.id ?? context.anchorPlace.id,
        target: context.placeById.get('root')!,
      });

      expect(ops).toEqual([
        {
          edge: { dst: 'root', kind: 'LINKS_TO', src: 'leaf' },
          op: 'CREATE_EDGE',
        },
      ]);
    });
  });

  describe('isAncestor', () => {
    it('returns true for ancestor chain and false for peers', () => {
      const context = buildContext();
      expect(isAncestor(context.placeById, 'leaf', 'root')).toBe(true);
      expect(isAncestor(context.placeById, 'leaf', 'dock')).toBe(false);
    });
  });
});
