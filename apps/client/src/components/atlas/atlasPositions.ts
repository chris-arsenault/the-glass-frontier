import type { HardState, RouteGeometryPoint, SpatialPosition } from '@glass-frontier/dto';

import type { AtlasGraph, AtlasNode } from './atlasGraph';

/**
 * Resolution of canon's fixed spatial geometry into chart coordinates.
 *
 * The source authors two coordinate shapes: polar positions in a system frame
 * (`radius` in orbit ranks, `angle_deg` counterclockwise), possibly relative
 * to another entity, and surface positions (`latitude_deg`/`longitude_deg`).
 * Entity references inside positions arrive as `tsonu:` external keys, so
 * this module resolves them against the entities' own externalKey values.
 */

export type PolarPoint = {
  /** Distance from the frame origin, in the frame's radial unit (orbit ranks). */
  radius: number;
  /** Counterclockwise from the frame's zero direction. */
  angleDeg: number;
};

export type SurfacePoint = {
  latitudeDeg: number;
  longitudeDeg: number;
  sizeClass?: string;
  extentRadiusKm?: number;
};

const numberAt = (
  coordinates: Record<string, number | string>,
  key: string
): number | undefined => {
  const value = coordinates[key];
  return typeof value === 'number' ? value : undefined;
};

const polarPositionOf = (entity: HardState): SpatialPosition | undefined =>
  entity.positions.find(
    (position) =>
      numberAt(position.coordinates, 'radius') !== undefined ||
      numberAt(position.coordinates, 'radial_offset') !== undefined
  );

const surfacePositionOf = (entity: HardState): SpatialPosition | undefined =>
  entity.positions.find(
    (position) =>
      numberAt(position.coordinates, 'latitude_deg') !== undefined &&
      numberAt(position.coordinates, 'longitude_deg') !== undefined
  );

/** Lookup for `tsonu:`-keyed references, built once per graph. */
export class AtlasPositionResolver {
  readonly #graph: AtlasGraph;
  readonly #byExternalKey = new Map<string, HardState>();
  readonly #polarCache = new Map<string, PolarPoint | null>();

  constructor(graph: AtlasGraph) {
    this.#graph = graph;
    for (const node of graph.nodes.values()) {
      if (node.entity.externalKey !== undefined) {
        this.#byExternalKey.set(node.entity.externalKey, node.entity);
      }
    }
  }

  /**
   * The entity's absolute polar position in the system frame, following
   * relative-to chains, or falling back to the position of the spatial
   * parent chain for surface-positioned and unpositioned descendants of a
   * positioned body. Null when nothing along the chain is positioned.
   */
  resolvePolar(entityId: string): PolarPoint | null {
    const cached = this.#polarCache.get(entityId);
    if (cached !== undefined) {
      return cached;
    }
    this.#polarCache.set(entityId, null); // cycle guard
    const resolved = this.#resolvePolarUncached(entityId);
    this.#polarCache.set(entityId, resolved);
    return resolved;
  }

  /** Resolve a `tsonu:` external-key reference to a polar point. */
  resolveReference(externalKey: string): PolarPoint | null {
    const entity = this.#byExternalKey.get(externalKey);
    return entity === undefined ? null : this.resolvePolar(entity.id);
  }

  entityByReference(externalKey: string): HardState | undefined {
    return this.#byExternalKey.get(externalKey);
  }

  /** A route-geometry point's polar position: anchor entity or literal coordinates. */
  resolveRoutePoint(point: RouteGeometryPoint): PolarPoint | null {
    if (point.entityId !== undefined) {
      return this.resolveReference(point.entityId);
    }
    if (point.coordinates !== undefined) {
      const radius = numberAt(point.coordinates, 'radius');
      const angle = numberAt(point.coordinates, 'angle_deg');
      if (radius !== undefined && angle !== undefined) {
        return { angleDeg: angle, radius };
      }
    }
    return null;
  }

  #resolvePolarUncached(entityId: string): PolarPoint | null {
    const node = this.#graph.nodes.get(entityId);
    if (!node) {
      return null;
    }
    const position = polarPositionOf(node.entity);
    if (position) {
      const radius = numberAt(position.coordinates, 'radius');
      const angle = numberAt(position.coordinates, 'angle_deg');
      if (radius !== undefined && angle !== undefined) {
        return { angleDeg: angle, radius };
      }
      // A relative position is a local vector around the reference body:
      // `radial_offset` is the separation in frame units and
      // `angle_offset_deg` the bearing around the body (a negative offset
      // points the vector the other way — sunward, for a Lagrange station).
      const radialOffset = numberAt(position.coordinates, 'radial_offset') ?? 0;
      const angleOffset = numberAt(position.coordinates, 'angle_offset_deg') ?? 0;
      const base =
        position.relativeToId === undefined
          ? null
          : this.resolveReference(position.relativeToId);
      if (base !== null) {
        const origin = toCartesian(base);
        const bearing = (angleOffset * Math.PI) / 180;
        const x = origin.x + radialOffset * Math.cos(bearing);
        const y = origin.y + radialOffset * Math.sin(bearing);
        return {
          angleDeg: (Math.atan2(y, x) * 180) / Math.PI,
          radius: Math.hypot(x, y),
        };
      }
      return null;
    }
    // No polar position of its own: sit at the spatial parent's position.
    if (node.parentId !== null) {
      return this.resolvePolar(node.parentId);
    }
    return null;
  }
}

/** Whether the entity declares its own polar position (absolute or relative). */
export const hasOwnPolarPosition = (entity: HardState): boolean =>
  polarPositionOf(entity) !== undefined;

export const surfacePoint = (entity: HardState): SurfacePoint | null => {
  const position = surfacePositionOf(entity);
  if (!position) {
    return null;
  }
  const sizeClass = position.coordinates.size_class;
  return {
    extentRadiusKm: numberAt(position.coordinates, 'extent_radius_km'),
    latitudeDeg: numberAt(position.coordinates, 'latitude_deg') ?? 0,
    longitudeDeg: numberAt(position.coordinates, 'longitude_deg') ?? 0,
    sizeClass: typeof sizeClass === 'string' ? sizeClass : undefined,
  };
};

export const toCartesian = (point: PolarPoint): { x: number; y: number } => {
  const radians = (point.angleDeg * Math.PI) / 180;
  return { x: point.radius * Math.cos(radians), y: point.radius * Math.sin(radians) };
};

/** Local offset of `point` from `origin`, in frame units. */
export const localOffset = (
  origin: PolarPoint,
  point: PolarPoint
): { x: number; y: number; distance: number } => {
  const a = toCartesian(origin);
  const b = toCartesian(point);
  const x = b.x - a.x;
  const y = b.y - a.y;
  return { distance: Math.hypot(x, y), x, y };
};

/** Nodes among `ids` that declare a surface position. */
export const surfacePositioned = (
  graph: AtlasGraph,
  ids: string[]
): Array<{ node: AtlasNode; point: SurfacePoint }> =>
  ids.flatMap((id) => {
    const node = graph.nodes.get(id);
    if (!node) {
      return [];
    }
    const point = surfacePoint(node.entity);
    return point === null ? [] : [{ node, point }];
  });
