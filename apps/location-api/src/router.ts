import {
  LocationDraftSchema,
  LocationEdgeKindSchema,
  LocationStateSchema,
  PageOptionsSchema,
} from '@glass-frontier/worldstate';
import { log } from '@glass-frontier/utils';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context';

const t = initTRPC.context<Context>().create();

export const locationRouter = t.router({
  createLocation: t.procedure
    .input(LocationDraftSchema)
    .mutation(async ({ ctx, input }) =>
      withMutationTelemetry(
        'create-location',
        { loginId: input.loginId, chronicleId: input.chronicleId },
        () => ctx.worldStateStore.createLocation(input)
      )
    ),

  getLocation: t.procedure
    .input(z.object({ locationId: z.string().min(1) }))
    .query(({ ctx, input }) => ctx.worldStateStore.getLocation(input.locationId)),

  listLocations: t.procedure
    .input(z.object({ loginId: z.string().min(1), page: PageOptionsSchema.optional() }))
    .query(({ ctx, input }) => ctx.worldStateStore.listLocations(input.loginId, input.page)),

  listLocationGraph: t.procedure
    .input(
      z.object({
        locationId: z.string().min(1),
        page: PageOptionsSchema.optional(),
        chunkSize: z.number().int().positive().max(25).optional(),
      })
    )
    .query(({ ctx, input }) =>
      ctx.worldStateStore.listLocationGraph(input.locationId, {
        ...(input.page ?? {}),
        chunkSize: input.chunkSize,
      })
    ),

  updateLocationState: t.procedure
    .input(LocationStateSchema)
    .mutation(async ({ ctx, input }) =>
      withMutationTelemetry(
        'update-location-state',
        { characterId: input.characterId, locationId: input.locationId },
        () => ctx.worldStateStore.updateLocationState(input)
      )
    ),

  listLocationNeighbors: t.procedure
    .input(
      z.object({
        locationId: z.string().min(1),
        placeId: z.string().min(1),
        limit: z.number().int().positive().max(200).optional(),
        cursor: z.string().optional(),
        maxDepth: z.number().int().nonnegative().optional(),
        relationKinds: z.array(LocationEdgeKindSchema).max(8).optional(),
      })
    )
    .query(({ ctx, input }) =>
      ctx.worldStateStore.listLocationNeighbors(input.locationId, input.placeId, {
        limit: input.limit,
        cursor: input.cursor,
        maxDepth: input.maxDepth,
        relationKinds: input.relationKinds,
      })
    ),
});

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

export type LocationRouter = typeof locationRouter;
