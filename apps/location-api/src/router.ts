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

  getPlace: t.procedure
    .input(z.object({ placeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => ctx.locationGraphStore.getPlace(input.placeId)),
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
