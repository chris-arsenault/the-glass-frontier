import { LocationEdgeKind } from '@glass-frontier/dto';
import type { LocationBreadcrumbEntry, LocationPlace } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context';

const t = initTRPC.context<Context>().create();

const locationSegmentSchema = z.object({
  description: z.string().optional(),
  kind: z.string().min(1),
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

export const locationRouter = t.router({
  addLocationEdge: t.procedure
    .input(
      z.object({
        dst: z.uuid(),
        kind: LocationEdgeKind,
        locationId: z.uuid(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        src: z.uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return withMutationTelemetry(
        'add-edge',
        {
          dst: input.dst,
          kind: input.kind,
          locationId: input.locationId,
          src: input.src,
        },
        async () => {
          await ctx.locationGraphStore.addEdge({
            dst: input.dst,
            kind: input.kind,
            locationId: input.locationId,
            metadata: input.metadata,
            src: input.src,
          });
          return ctx.locationGraphStore.getLocationGraph(input.locationId);
        }
      );
    }),

  createLocationChain: t.procedure
    .input(
      z.object({
        parentId: z.uuid().optional(),
        segments: z.array(locationSegmentSchema).min(1).max(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return withMutationTelemetry(
        'create-chain',
        { parentId: input.parentId ?? null, segments: input.segments.length },
        async () => {
          const segments = input.segments.map((segment) => ({
            ...segment,
            tags: normalizeTags(segment.tags),
          }));
          const result = await ctx.locationGraphStore.createLocationChain({
            parentId: input.parentId,
            segments,
          });
          const breadcrumb = await buildLocationBreadcrumb(ctx.locationGraphStore, result.anchor);
          return { anchor: result.anchor, breadcrumb, created: result.created };
        }
      );
    }),

  createLocationPlace: t.procedure
    .input(
      z.object({
        description: z.string().max(500).optional(),
        kind: z.string().min(1),
        name: z.string().min(1),
        parentId: z.uuid().optional(),
        tags: z.array(z.string()).max(12).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return withMutationTelemetry(
        'create-place',
        {
          kind: input.kind,
          name: input.name,
          parentId: input.parentId ?? null,
        },
        async () => {
          const place = await ctx.locationGraphStore.createPlace({
            description: input.description,
            kind: input.kind,
            name: input.name,
            parentId: input.parentId,
            tags: normalizeTags(input.tags),
          });
          const breadcrumb = await buildLocationBreadcrumb(ctx.locationGraphStore, place);
          return { breadcrumb, place };
        }
      );
    }),

  getLocationGraph: t.procedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => ctx.locationGraphStore.getLocationGraph(input.locationId)),

  getLocationPlace: t.procedure
    .input(z.object({ placeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const place = await ctx.locationGraphStore.getPlace(input.placeId);
      if (place === null || place === undefined) {
        throw new Error('Location not found.');
      }
      const breadcrumb = await buildLocationBreadcrumb(ctx.locationGraphStore, place);
      return { breadcrumb, place };
    }),

  listLocations: t.procedure
    .input(
      z
        .object({
          limit: z.number().int().positive().max(100).optional(),
          search: z.string().min(1).max(64).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => ctx.locationGraphStore.listLocationRoots(input)),

  removeLocationEdge: t.procedure
    .input(
      z.object({
        dst: z.uuid(),
        kind: LocationEdgeKind,
        locationId: z.uuid(),
        src: z.uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return withMutationTelemetry(
        'remove-edge',
        {
          dst: input.dst,
          kind: input.kind,
          locationId: input.locationId,
          src: input.src,
        },
        async () => {
          await ctx.locationGraphStore.removeEdge({
            dst: input.dst,
            kind: input.kind,
            locationId: input.locationId,
            src: input.src,
          });
          return ctx.locationGraphStore.getLocationGraph(input.locationId);
        }
      );
    }),

  updateLocationPlace: t.procedure
    .input(
      z.object({
        description: z.string().max(1000).optional().or(z.literal('')).optional(),
        kind: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        parentId: z.string().uuid().nullable().optional(),
        placeId: z.string().uuid(),
        tags: z.array(z.string()).max(12).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return withMutationTelemetry(
        'update-place',
        {
          parentId: input.parentId ?? null,
          placeId: input.placeId,
        },
        async () => {
          const place = await ctx.locationGraphStore.updatePlace({
            canonicalParentId: input.parentId ?? undefined,
            description: input.description,
            kind: input.kind,
            name: input.name,
            placeId: input.placeId,
            tags: input.tags === undefined ? undefined : normalizeTags(input.tags),
          });
          const breadcrumb = await buildLocationBreadcrumb(ctx.locationGraphStore, place);
          return { breadcrumb, place };
        }
      );
    }),
});

async function buildLocationBreadcrumb(
  store: Context['locationGraphStore'],
  place: LocationPlace
): Promise<LocationBreadcrumbEntry[]> {
  const chain = await collectAncestorChain(store, place, 0);
  return chain.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
  }));
}

function normalizeTags(tags?: string[] | null): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const value = tag.trim().toLowerCase();
    if (value.length === 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
    if (result.length >= 12) {
      break;
    }
  }
  return result;
}

async function collectAncestorChain(
  store: Context['locationGraphStore'],
  place: LocationPlace,
  depth: number
): Promise<LocationPlace[]> {
  if (depth >= 20 || !isNonEmptyString(place.canonicalParentId)) {
    return [place];
  }

  const parent = await store.getPlace(place.canonicalParentId);
  if (parent === null || parent === undefined) {
    return [place];
  }

  const chain = await collectAncestorChain(store, parent, depth + 1);
  chain.push(place);
  return chain;
}

const withMutationTelemetry = async <T>(
  operation: string,
  metadata: Record<string, unknown>,
  handler: () => Promise<T>
): Promise<T> => {
  log('info', `location-api.${operation}.start`, metadata);
  try {
    const result = await handler();
    log('info', `location-api.${operation}.success`, metadata);
    return result;
  } catch (error) {
    log('error', `location-api.${operation}.failed`, {
      ...metadata,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  }
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export type LocationRouter = typeof locationRouter;
