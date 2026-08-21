import { HardStateKind, HardStateProminence, isLocationKind } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context';

const t = initTRPC.context<Context>().create();

const isUuid = (s: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/**
 * The Atlas reads canon; it does not write it.
 *
 * Canon is written only by `commitBatch` — the seed importer today, the
 * close-time judge later. Correcting canon means reverting a batch and
 * ingesting a fixed one, not editing a row, so there is no mutation surface
 * here beyond starting a chronicle.
 */
export const appRouter = t.router({
  // POST /entities/batch
  batchGetEntities: t.procedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      log('info', 'atlas-api: batchGetEntities', { count: input.ids.length });
      return ctx.worldSchemaStore.listEntitiesByIds(input.ids);
    }),

  // POST /chronicles
  createChronicle: t.procedure
    .input(
      z.object({
        anchorSlug: z.string().min(1),
        characterId: z.string().uuid().optional(),
        locationSlug: z.string().min(1).optional(),
        playerId: z.string().min(1),
        title: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.playerId !== ctx.identity.sub) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      log('info', 'atlas-api: createChronicle', { title: input.title });

      const anchor = await ctx.worldSchemaStore.getEntityBySlug({ slug: input.anchorSlug });
      if (anchor === null) {
        throw new Error('Anchor not found');
      }

      let location = null;
      if (input.locationSlug !== undefined && input.locationSlug.length > 0) {
        location = await ctx.worldSchemaStore.getEntityBySlug({ slug: input.locationSlug });
        if (location === null || !isLocationKind(location.kind)) {
          throw new Error('Location not found or invalid kind');
        }
      } else {
        const linked = await ctx.worldSchemaStore.listEntitiesByIds(
          anchor.links.map((link) => link.targetId)
        );
        location = linked.find((entity) => isLocationKind(entity.kind)) ?? null;
        if (location === null) {
          throw new Error('No location neighbors found for anchor entity');
        }
      }

      return ctx.chronicleStore.ensureChronicle({
        anchorEntityId: anchor.id,
        characterId: input.characterId,
        locationId: location.id,
        locationName: location.name,
        playerId: ctx.identity.sub,
        title: input.title,
      });
    }),

  // GET /entities/:identifier
  getEntity: t.procedure
    .input(z.object({ identifier: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      log('info', 'atlas-api: getEntity', { identifier: input.identifier });
      const { identifier } = input;

      let entity = isUuid(identifier)
        ? await ctx.worldSchemaStore.getEntity({ id: identifier })
        : null;
      if (entity === null) {
        entity = await ctx.worldSchemaStore.getEntityBySlug({ slug: identifier });
      }
      if (entity === null) {
        throw new Error('Entity not found');
      }

      const fragments = await ctx.worldSchemaStore.listLoreFragmentsByEntity({
        entityId: entity.id,
        limit: 200,
      });
      return { entity, fragments };
    }),

  // GET /entities/:identifier/neighbors
  getEntityNeighbors: t.procedure
    .input(
      z.object({
        identifier: z.string().min(1),
        kind: HardStateKind.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      log('info', 'atlas-api: getEntityNeighbors', { identifier: input.identifier });
      const { identifier, kind } = input;

      let entity = isUuid(identifier)
        ? await ctx.worldSchemaStore.getEntity({ id: identifier })
        : null;
      if (entity === null) {
        entity = await ctx.worldSchemaStore.getEntityBySlug({ slug: identifier });
      }
      if (entity === null) {
        throw new Error('Entity not found');
      }

      const neighbors = await ctx.worldSchemaStore.listEntitiesByIds(
        entity.links.map((link) => link.targetId)
      );
      return {
        entity,
        neighbors:
          kind === undefined ? neighbors : neighbors.filter((entry) => entry.kind === kind),
      };
    }),

  // GET /entities
  listEntities: t.procedure
    .input(
      z.object({
        kind: HardStateKind.optional(),
        limit: z.number().int().min(1).max(200).optional(),
        maxProminence: HardStateProminence.optional(),
        minProminence: HardStateProminence.optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      log('info', 'atlas-api: listEntities', { kind: input?.kind ?? '' });
      return ctx.worldSchemaStore.listEntities({
        kind: input?.kind,
        limit: input?.limit ?? 200,
        maxProminence: input?.maxProminence,
        minProminence: input?.minProminence,
      });
    }),
});

export type AppRouter = typeof appRouter;
