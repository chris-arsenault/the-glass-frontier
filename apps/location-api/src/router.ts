import { LocationEdgeKind } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context';

const t = initTRPC.context<Context>().create();

const normalizeTags = (tags?: string[] | null): string[] => {
  if (!Array.isArray(tags)) {
    return [];
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const candidate = tag.trim().toLowerCase();
    if (candidate.length === 0 || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    result.push(candidate);
    if (result.length >= 12) {
      break;
    }
  }
  return result;
};

export const locationRouter = t.router({
  upsertLocation: t.procedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        kind: z.string().min(1),
        description: z.string().max(1000).optional().or(z.literal('')).optional(),
        tags: z.array(z.string()).max(24).optional(),
        biome: z.string().max(120).optional().or(z.literal('')).optional(),
        parentId: z.string().uuid().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return withMutationTelemetry(
        'upsert-location',
        { id: input.id ?? null, parentId: input.parentId ?? null },
        async () =>
          ctx.locationGraphStore.upsertLocation({
            biome: input.biome ?? null,
            description: input.description ?? null,
            id: input.id,
            kind: input.kind,
            name: input.name,
            parentId: input.parentId ?? null,
            tags: normalizeTags(input.tags),
          })
      );
    }),

  deleteLocation: t.procedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) =>
      withMutationTelemetry('delete-location', { id: input.id }, () =>
        ctx.locationGraphStore.deleteLocation({ id: input.id })
      )
    ),

  upsertEdge: t.procedure
    .input(
      z.object({
        src: z.uuid(),
        dst: z.uuid(),
        kind: LocationEdgeKind,
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      withMutationTelemetry('upsert-edge', { src: input.src, dst: input.dst, kind: input.kind }, () =>
        ctx.locationGraphStore.upsertEdge(input)
      )
    ),

  deleteEdge: t.procedure
    .input(z.object({ src: z.uuid(), dst: z.uuid(), kind: LocationEdgeKind }))
    .mutation(async ({ ctx, input }) =>
      withMutationTelemetry('delete-edge', { src: input.src, dst: input.dst, kind: input.kind }, () =>
        ctx.locationGraphStore.deleteEdge(input)
      )
    ),

  listLocationRoots: t.procedure
    .input(
      z
        .object({
          limit: z.number().int().positive().max(100).optional(),
          search: z.string().min(1).max(64).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => ctx.locationGraphStore.listLocationRoots(input)),

  getLocationChain: t.procedure
    .input(z.object({ anchorId: z.string().uuid() }))
    .query(async ({ ctx, input }) => ctx.locationGraphStore.getLocationChain({ anchorId: input.anchorId })),

  getLocationNeighbors: t.procedure
    .input(
      z.object({
        id: z.string().uuid(),
        kind: LocationEdgeKind.optional(),
        limit: z.number().int().positive().max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => ctx.locationGraphStore.getLocationNeighbors(input)),

  appendLocationEvents: t.procedure
    .input(
      z.object({
        locationId: z.string().uuid(),
        events: z
          .array(
            z.object({
              chronicleId: z.string().uuid(),
              summary: z.string().min(1).max(400),
              scope: z.string().max(120).optional(),
              metadata: z.record(z.string(), z.unknown()).optional(),
            })
          )
          .min(1)
          .max(50),
      })
    )
    .mutation(async ({ ctx, input }) =>
      withMutationTelemetry(
        'append-location-events',
        { locationId: input.locationId, events: input.events.length },
        () => ctx.locationGraphStore.appendLocationEvents(input)
      )
    ),

  listLocationEvents: t.procedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => ctx.locationGraphStore.listLocationEvents({ locationId: input.locationId })),

  getLocationDetails: t.procedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => ctx.locationGraphStore.getLocationDetails({ id: input.id })),

  // Backward-compatible aliases (to be removed after callers migrate)
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
    .mutation(async ({ ctx, input }) =>
      withMutationTelemetry(
        'add-edge',
        { dst: input.dst, kind: input.kind, src: input.src },
        async () => {
          await ctx.locationGraphStore.upsertEdge({
            dst: input.dst,
            kind: input.kind,
            metadata: input.metadata,
            src: input.src,
          });
          return ctx.locationGraphStore.getLocationGraph(input.locationId);
        }
      )
    ),

  removeLocationEdge: t.procedure
    .input(
      z.object({
        dst: z.uuid(),
        kind: LocationEdgeKind,
        locationId: z.uuid(),
        src: z.uuid(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      withMutationTelemetry(
        'remove-edge',
        { dst: input.dst, kind: input.kind, src: input.src },
        async () => {
          await ctx.locationGraphStore.deleteEdge({
            dst: input.dst,
            kind: input.kind,
            src: input.src,
          });
          return ctx.locationGraphStore.getLocationGraph(input.locationId);
        }
      )
    ),

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
    .mutation(async ({ ctx, input }) =>
      withMutationTelemetry(
        'create-place',
        { kind: input.kind, name: input.name, parentId: input.parentId ?? null },
        async () => {
          const place = await ctx.locationGraphStore.upsertLocation({
            description: input.description,
            kind: input.kind,
            name: input.name,
            parentId: input.parentId ?? null,
            tags: normalizeTags(input.tags),
          });
          const breadcrumb = await ctx.locationGraphStore.getLocationChain({ anchorId: place.id });
          return { breadcrumb, place };
        }
      )
    ),

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
    .mutation(async ({ ctx, input }) =>
      withMutationTelemetry(
        'update-place',
        { parentId: input.parentId ?? null, placeId: input.placeId },
        async () => {
          const place = await ctx.locationGraphStore.upsertLocation({
            description: input.description ?? undefined,
            id: input.placeId,
            kind: input.kind ?? 'locale',
            name: input.name ?? 'Unknown',
            parentId: input.parentId ?? null,
            tags: normalizeTags(input.tags),
          });
          const breadcrumb = await ctx.locationGraphStore.getLocationChain({ anchorId: place.id });
          return { breadcrumb, place };
        }
      )
    ),

  getLocationGraph: t.procedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => ctx.locationGraphStore.getLocationGraph(input.locationId)),

  getLocationPlace: t.procedure
    .input(z.object({ placeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const place = await ctx.locationGraphStore.getPlace(input.placeId);
      if (!place) {
        throw new Error('Location not found.');
      }
      const breadcrumb = await ctx.locationGraphStore.getLocationChain({ anchorId: place.id });
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

  createLocationChain: t.procedure
    .input(
      z.object({
        parentId: z.uuid().optional(),
        segments: z
          .array(
            z.object({
              description: z.string().optional(),
              kind: z.string().min(1),
              name: z.string().min(1),
              tags: z.array(z.string()).default([]),
            })
          )
          .min(1)
          .max(5),
      })
    )
    .mutation(async ({ ctx, input }) =>
      withMutationTelemetry(
        'create-chain',
        { parentId: input.parentId ?? null, segments: input.segments.length },
        async () => {
          const created = await ctx.locationGraphStore.createLocationChain({
            parentId: input.parentId ?? null,
            segments: input.segments.map((seg) => ({
              ...seg,
              tags: normalizeTags(seg.tags),
            })),
          });
          const breadcrumb = await ctx.locationGraphStore.getLocationChain({ anchorId: created.anchor.id });
          return { anchor: created.anchor, breadcrumb, created: created.created };
        }
      )
    ),
});

async function withMutationTelemetry<T>(
  action: string,
  metadata: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    log('error', `Location mutation failed: ${action}`, { metadata, error });
    throw error;
  }
}

export type LocationRouter = typeof locationRouter;
