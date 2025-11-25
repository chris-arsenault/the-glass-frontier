import { log } from '@glass-frontier/utils';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context';

const t = initTRPC.context<Context>().create();

const prominenceSchema = z.enum(['forgotten', 'marginal', 'recognized', 'renowned', 'mythic']);

const hardStateInput = z.object({
  id: z.string().uuid().optional(),
  kind: z.string().min(1),
  subkind: z.string().optional(),
  name: z.string().min(1),
  description: z.string().max(2000).optional(),
  status: z.string().optional(),
  prominence: prominenceSchema.optional(),
  links: z
    .array(
      z.object({
        relationship: z.string().min(1),
        targetId: z.string().uuid(),
        strength: z.number().min(0).max(1).optional(),
      })
    )
    .optional(),
});

const fragmentInput = z.object({
  id: z.string().uuid().optional(),
  entityId: z.string().uuid(),
  title: z.string().min(1),
  prose: z.string().min(1),
  chronicleId: z.string().uuid().optional(),
  beatId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export const appRouter = t.router({
  // GET /entities
  listEntities: t.procedure
    .input(
      z.object({
        kind: z.string().optional(),
        minProminence: prominenceSchema.optional(),
        maxProminence: prominenceSchema.optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      log('info', 'atlas-api: listEntities', { kind: input?.kind });
      return ctx.worldSchemaStore.listEntities({
        kind: input?.kind as never,
        limit: input?.limit ?? 200,
        minProminence: input?.minProminence as never,
        maxProminence: input?.maxProminence as never,
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
      if (!entity) {
        entity = await ctx.worldSchemaStore.getEntityBySlug({ slug: identifier });
      }
      if (!entity) {
        throw new Error('Entity not found');
      }

      const fragments = await ctx.worldSchemaStore.listLoreFragmentsByEntity({
        entityId: entity.id,
        limit: 200,
      });
      return { entity, fragments };
    }),

  // POST /entities/batch
  batchGetEntities: t.procedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      log('info', 'atlas-api: batchGetEntities', { count: input.ids.length });
      const entities = await Promise.all(
        input.ids.map((id) => ctx.worldSchemaStore.getEntity({ id }))
      );
      return entities.filter((e): e is NonNullable<typeof e> => e !== null);
    }),

  // GET /entities/:identifier/neighbors
  getEntityNeighbors: t.procedure
    .input(
      z.object({
        identifier: z.string().min(1),
        kind: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      log('info', 'atlas-api: getEntityNeighbors', { identifier: input.identifier });
      const { identifier, kind } = input;

      let entity = isUuid(identifier)
        ? await ctx.worldSchemaStore.getEntity({ id: identifier })
        : null;
      if (!entity) {
        entity = await ctx.worldSchemaStore.getEntityBySlug({ slug: identifier });
      }
      if (!entity) {
        throw new Error('Entity not found');
      }

      const neighborIds = entity.links.map((link) => link.targetId);
      if (neighborIds.length === 0) {
        return { entity, neighbors: [] };
      }

      const neighbors = await Promise.all(
        neighborIds.map((id) => ctx.worldSchemaStore.getEntity({ id }))
      );

      let validNeighbors = neighbors.filter((e): e is NonNullable<typeof e> => e !== null);
      if (kind) {
        validNeighbors = validNeighbors.filter((n) => n.kind === kind);
      }

      return { entity, neighbors: validNeighbors };
    }),

  // POST /entities
  upsertEntity: t.procedure
    .input(hardStateInput)
    .mutation(async ({ ctx, input }) => {
      log('info', 'atlas-api: upsertEntity', { name: input.name, kind: input.kind });
      return ctx.worldSchemaStore.upsertEntity({
        id: input.id,
        kind: input.kind as never,
        subkind: input.subkind as never,
        name: input.name,
        description: input.description ?? undefined,
        prominence: (input.prominence as never) ?? undefined,
        status: (input.status as never) ?? null,
        links: input.links,
      });
    }),

  // POST /relationships
  upsertRelationship: t.procedure
    .input(
      z.object({
        srcId: z.string().uuid(),
        dstId: z.string().uuid(),
        relationship: z.string().min(1),
        strength: z.number().min(0).max(1).optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      log('info', 'atlas-api: upsertRelationship', { relationship: input.relationship });
      await ctx.worldSchemaStore.upsertRelationship(input);
      return { ok: true };
    }),

  // DELETE /relationships
  deleteRelationship: t.procedure
    .input(
      z.object({
        srcId: z.string().uuid(),
        dstId: z.string().uuid(),
        relationship: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      log('info', 'atlas-api: deleteRelationship', { relationship: input.relationship });
      await ctx.worldSchemaStore.deleteRelationship(input);
      return { ok: true };
    }),

  // POST /fragments
  createFragment: t.procedure
    .input(fragmentInput)
    .mutation(async ({ ctx, input }) => {
      log('info', 'atlas-api: createFragment', { title: input.title });
      return ctx.worldSchemaStore.createLoreFragment({
        id: input.id,
        entityId: input.entityId,
        title: input.title,
        prose: input.prose,
        tags: input.tags,
        source: {
          chronicleId: input.chronicleId,
          beatId: input.beatId,
        },
      });
    }),

  // PUT /fragments/:id
  updateFragment: t.procedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        prose: z.string().min(1).optional(),
        chronicleId: z.string().uuid().optional(),
        beatId: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      log('info', 'atlas-api: updateFragment', { id: input.id });
      return ctx.worldSchemaStore.updateLoreFragment({
        id: input.id,
        title: input.title,
        prose: input.prose,
        tags: input.tags,
        source: {
          chronicleId: input.chronicleId,
          beatId: input.beatId,
        },
      });
    }),

  // DELETE /fragments/:id
  deleteFragment: t.procedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      log('info', 'atlas-api: deleteFragment', { id: input.id });
      await ctx.worldSchemaStore.deleteLoreFragment({ id: input.id });
      return { ok: true };
    }),

  // POST /chronicles
  createChronicle: t.procedure
    .input(
      z.object({
        playerId: z.string().min(1),
        title: z.string().min(1),
        locationSlug: z.string().min(1).optional(),
        anchorSlug: z.string().min(1),
        characterId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      log('info', 'atlas-api: createChronicle', { title: input.title });

      const anchor = await ctx.worldSchemaStore.getEntityBySlug({ slug: input.anchorSlug });
      if (!anchor) {
        throw new Error('Anchor not found');
      }

      let location;
      if (input.locationSlug) {
        location = await ctx.worldSchemaStore.getEntityBySlug({ slug: input.locationSlug });
        if (!location || location.kind !== 'location') {
          throw new Error('Location not found or invalid kind');
        }
      } else {
        const linkedIds = anchor.links.map((link) => link.targetId);
        for (const linkedId of linkedIds) {
          const entity = await ctx.worldSchemaStore.getEntity({ id: linkedId });
          if (entity && entity.kind === 'location') {
            location = entity;
            break;
          }
        }
        if (!location) {
          throw new Error('No location neighbors found for anchor entity');
        }
      }

      return ctx.chronicleStore.ensureChronicle({
        playerId: input.playerId,
        locationId: location.id,
        characterId: input.characterId,
        title: input.title,
        anchorEntityId: anchor.id,
      });
    }),
});

export type AppRouter = typeof appRouter;
