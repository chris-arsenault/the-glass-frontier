import type { HardState } from '@glass-frontier/dto';

/**
 * The spatial skeleton of the atlas, derived entirely from canon edges.
 *
 * Every location-shaped entity gets at most one spatial parent, chosen from
 * its outgoing links by how physically specific the verb is: sitting on a
 * surface beats being in orbit, which beats the generic "located in". The
 * result is a forest; the celestial branch (sun, planets, moons) is lifted
 * out so the system map can draw it, and everything else hangs beneath it.
 */

const PARENT_RELATIONSHIPS = [
  'on_surface_of',
  'in_orbit_of',
  'orbits',
  'located_in',
  'part_of',
] as const;

type ParentRelationship = (typeof PARENT_RELATIONSHIPS)[number];

export type AtlasChildGroup = 'orbit' | 'surface' | 'within';

const CHILD_GROUP_BY_RELATIONSHIP: Record<ParentRelationship, AtlasChildGroup> = {
  in_orbit_of: 'orbit',
  located_in: 'within',
  on_surface_of: 'surface',
  orbits: 'orbit',
  part_of: 'within',
};

export type AtlasNode = {
  entity: HardState;
  parentId: string | null;
  parentRelationship: ParentRelationship | null;
  /** Child ids, bucketed by how they attach to this node. */
  children: Record<AtlasChildGroup, string[]>;
};

export type AtlasGraph = {
  nodes: Map<string, AtlasNode>;
  idBySlug: Map<string, string>;
  /** The body other bodies orbit; null when the data has no celestial layer. */
  sunId: string | null;
  /** The star_system container entity, when canon declares one. */
  systemId: string | null;
  /** Bodies orbiting the sun, ordered inner → outer via `inner_of` edges. */
  planetIds: string[];
  /** Parentless locations outside the celestial branch. */
  rootIds: string[];
  /** The planet with the most charted descendants — the setting's home. */
  homeId: string | null;
};

const byName = (nodes: Map<string, AtlasNode>) => (a: string, b: string) =>
  (nodes.get(a)?.entity.name ?? '').localeCompare(nodes.get(b)?.entity.name ?? '');

/**
 * Order planets inner → outer using `inner_of` edges (a inner_of b means a is
 * closer to the sun). Planets outside any chain sort after ordered ones, by
 * name, so partial data still yields a stable map.
 */
const orderPlanets = (planetIds: string[], nodes: Map<string, AtlasNode>): string[] => {
  const planetSet = new Set(planetIds);
  const outward = new Map<string, string[]>();
  const innerDegree = new Map<string, number>(planetIds.map((id) => [id, 0]));
  for (const id of planetIds) {
    const node = nodes.get(id);
    if (!node) {
      continue;
    }
    for (const link of node.entity.links) {
      if (link.relationship !== 'inner_of' || link.direction !== 'out') {
        continue;
      }
      if (!planetSet.has(link.targetId)) {
        continue;
      }
      outward.set(id, [...(outward.get(id) ?? []), link.targetId]);
      innerDegree.set(link.targetId, (innerDegree.get(link.targetId) ?? 0) + 1);
    }
  }
  const queue = planetIds
    .filter((id) => (innerDegree.get(id) ?? 0) === 0)
    .sort(byName(nodes));
  const ordered: string[] = [];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    ordered.push(id);
    for (const next of (outward.get(id) ?? []).sort(byName(nodes))) {
      const remaining = (innerDegree.get(next) ?? 0) - 1;
      innerDegree.set(next, remaining);
      if (remaining <= 0) {
        queue.push(next);
      }
    }
  }
  for (const id of [...planetIds].sort(byName(nodes))) {
    if (!seen.has(id)) {
      ordered.push(id);
    }
  }
  return ordered;
};

export const buildAtlasGraph = (locations: HardState[]): AtlasGraph => {
  const nodes = new Map<string, AtlasNode>();
  const idBySlug = new Map<string, string>();
  for (const entity of locations) {
    nodes.set(entity.id, {
      children: { orbit: [], surface: [], within: [] },
      entity,
      parentId: null,
      parentRelationship: null,
    });
    idBySlug.set(entity.slug, entity.id);
  }

  for (const node of nodes.values()) {
    for (const relationship of PARENT_RELATIONSHIPS) {
      const link = node.entity.links.find(
        (candidate) =>
          candidate.direction === 'out' &&
          candidate.relationship === relationship &&
          nodes.has(candidate.targetId) &&
          candidate.targetId !== node.entity.id
      );
      if (link) {
        node.parentId = link.targetId;
        node.parentRelationship = relationship;
        break;
      }
    }
  }

  // A parent cycle would detach a subtree from every root; break any by
  // walking each chain and cutting the edge that closes a loop.
  for (const node of nodes.values()) {
    const trail = new Set<string>([node.entity.id]);
    let current = node;
    while (current.parentId !== null) {
      if (trail.has(current.parentId)) {
        current.parentId = null;
        current.parentRelationship = null;
        break;
      }
      trail.add(current.parentId);
      const parent = nodes.get(current.parentId);
      if (!parent) {
        break;
      }
      current = parent;
    }
  }

  for (const node of nodes.values()) {
    if (node.parentId === null || node.parentRelationship === null) {
      continue;
    }
    const parent = nodes.get(node.parentId);
    if (!parent) {
      continue;
    }
    parent.children[CHILD_GROUP_BY_RELATIONSHIP[node.parentRelationship]].push(node.entity.id);
  }
  for (const node of nodes.values()) {
    node.children.orbit.sort(byName(nodes));
    node.children.surface.sort(byName(nodes));
    node.children.within.sort(byName(nodes));
  }

  // The sun is the body things orbit that itself orbits nothing.
  let sunId: string | null = null;
  let bestOrbiters = 0;
  for (const node of nodes.values()) {
    if (node.parentRelationship === 'orbits' || node.parentRelationship === 'in_orbit_of') {
      continue;
    }
    const orbiters = node.children.orbit.length;
    if (orbiters > bestOrbiters) {
      bestOrbiters = orbiters;
      sunId = node.entity.id;
    }
  }

  const systemId =
    [...nodes.values()].find((node) => node.entity.subkind === 'star_system')?.entity.id ?? null;

  const planetIds =
    sunId === null ? [] : orderPlanets(nodes.get(sunId)?.children.orbit ?? [], nodes);

  const celestialBranch = new Set<string>();
  if (sunId !== null) {
    const stack = [sunId];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (celestialBranch.has(id)) {
        continue;
      }
      celestialBranch.add(id);
      const node = nodes.get(id);
      if (node) {
        stack.push(...node.children.orbit, ...node.children.surface, ...node.children.within);
      }
    }
  }

  const rootIds = [...nodes.values()]
    .filter(
      (node) =>
        node.parentId === null &&
        node.entity.id !== sunId &&
        node.entity.id !== systemId &&
        !celestialBranch.has(node.entity.id)
    )
    .map((node) => node.entity.id)
    .sort(byName(nodes));

  let homeId: string | null = null;
  let bestDescendants = -1;
  for (const planetId of planetIds) {
    const count = countDescendants(nodes, planetId);
    if (count > bestDescendants) {
      bestDescendants = count;
      homeId = planetId;
    }
  }

  return { homeId, idBySlug, nodes, planetIds, rootIds, sunId, systemId };
};

const countDescendants = (nodes: Map<string, AtlasNode>, id: string): number => {
  const node = nodes.get(id);
  if (!node) {
    return 0;
  }
  const childIds = [...node.children.orbit, ...node.children.surface, ...node.children.within];
  return childIds.reduce((sum, childId) => sum + 1 + countDescendants(nodes, childId), 0);
};

export const descendantCount = (graph: AtlasGraph, id: string): number =>
  countDescendants(graph.nodes, id);

export const childIds = (node: AtlasNode): string[] => [
  ...node.children.orbit,
  ...node.children.surface,
  ...node.children.within,
];

/** Parent chain from the outermost container down to the entity itself. */
export const breadcrumbIds = (graph: AtlasGraph, id: string): string[] => {
  const chain: string[] = [];
  let current = graph.nodes.get(id);
  const guard = new Set<string>();
  while (current && !guard.has(current.entity.id)) {
    guard.add(current.entity.id);
    chain.unshift(current.entity.id);
    current = current.parentId === null ? undefined : graph.nodes.get(current.parentId);
  }
  return chain;
};
