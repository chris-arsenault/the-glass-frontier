import {
  HardStateKind,
  HardStateProminence,
  HardStateStatus,
  HardStateSubkind,
} from '@glass-frontier/dto';
import { hasAnyGroup } from '@glass-frontier/node-utils';
import { log } from '@glass-frontier/utils';
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context';

const t = initTRPC.context<Context>().create();
const moderatorProcedure = t.procedure.use(({ ctx, next }) => {
  if (!hasAnyGroup(ctx.identity, ['admin', 'moderator'])) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});

const hardStateInput = z.object({
  description: z.string().max(2000).optional(),
  id: z.string().uuid().optional(),
  kind: HardStateKind,
  links: z
    .array(
      z.object({
        relationship: z.string().min(1),
        strength: z.number().min(0).max(1).optional(),
        targetId: z.string().uuid(),
      })
    )
    .optional(),
  name: z.string().min(1),
  prominence: HardStateProminence.optional(),
  status: HardStateStatus.optional(),
  subkind: HardStateSubkind.optional(),
});

const fragmentInput = z.object({
  beatId: z.string().optional(),
  chronicleId: z.string().uuid().optional(),
  entityId: z.string().uuid(),
  id: z.string().uuid().optional(),
  prose: z.string().min(1),
  tags: z.array(z.string()).optional(),
  title: z.string().min(1),
});

const isUuid = (s: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export const appRouter = t.router({
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
        if (location === null || location.kind !== 'location') {
          throw new Error('Location not found or invalid kind');
        }
      } else {
        const linkedIds = anchor.links.map((link) => link.targetId);
        const linkedEntities = await Promise.all(
          linkedIds.map((id) => ctx.worldSchemaStore.getEntity({ id }))
        );
        location = linkedEntities.find((entity) => entity?.kind === 'location') ?? null;
        if (location === null) {
          throw new Error('No location neighbors found for anchor entity');
        }
      }

      return ctx.chronicleStore.ensureChronicle({
        anchorEntityId: anchor.id,
        characterId: input.characterId,
        locationId: location.id,
        playerId: ctx.identity.sub,
        title: input.title,
      });
    }),

  // POST /fragments
  createFragment: moderatorProcedure
    .input(fragmentInput)
    .mutation(async ({ ctx, input }) => {
      log('info', 'atlas-api: createFragment', { title: input.title });
      return ctx.worldSchemaStore.createLoreFragment({
        entityId: input.entityId,
        id: input.id,
        prose: input.prose,
        source: {
          beatId: input.beatId,
          chronicleId: input.chronicleId,
        },
        tags: input.tags,
        title: input.title,
      });
    }),

  // DELETE /fragments/:id
  deleteFragment: moderatorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      log('info', 'atlas-api: deleteFragment', { id: input.id });
      await ctx.worldSchemaStore.deleteLoreFragment({ id: input.id });
      return { ok: true };
    }),

  // DELETE /relationships
  deleteRelationship: moderatorProcedure
    .input(
      z.object({
        dstId: z.string().uuid(),
        relationship: z.string().min(1),
        srcId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      log('info', 'atlas-api: deleteRelationship', { relationship: input.relationship });
      await ctx.worldSchemaStore.deleteRelationship(input);
      return { ok: true };
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

      const neighborIds = entity.links.map((link) => link.targetId);
      if (neighborIds.length === 0) {
        return { entity, neighbors: [] };
      }

      const neighbors = await Promise.all(
        neighborIds.map((id) => ctx.worldSchemaStore.getEntity({ id }))
      );

      let validNeighbors = neighbors.filter((e): e is NonNullable<typeof e> => e !== null);
      if (kind !== undefined && kind.length > 0) {
        validNeighbors = validNeighbors.filter((n) => n.kind === kind);
      }

      return { entity, neighbors: validNeighbors };
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

  // PUT /fragments/:id
  updateFragment: moderatorProcedure
    .input(
      z.object({
        beatId: z.string().optional(),
        chronicleId: z.string().uuid().optional(),
        id: z.string().uuid(),
        prose: z.string().min(1).optional(),
        tags: z.array(z.string()).optional(),
        title: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      log('info', 'atlas-api: updateFragment', { id: input.id });
      return ctx.worldSchemaStore.updateLoreFragment({
        id: input.id,
        prose: input.prose,
        source: {
          beatId: input.beatId,
          chronicleId: input.chronicleId,
        },
        tags: input.tags,
        title: input.title,
      });
    }),

  // POST /entities
  upsertEntity: moderatorProcedure
    .input(hardStateInput)
    .mutation(async ({ ctx, input }) => {
      log('info', 'atlas-api: upsertEntity', { kind: input.kind, name: input.name });
      return ctx.worldSchemaStore.upsertEntity({
        description: input.description ?? undefined,
        id: input.id,
        kind: input.kind,
        links: input.links,
        name: input.name,
        prominence: input.prominence,
        status: input.status ?? null,
        subkind: input.subkind ?? null,
      });
    }),

  // POST /relationships
  upsertRelationship: moderatorProcedure
    .input(
      z.object({
        dstId: z.string().uuid(),
        relationship: z.string().min(1),
        srcId: z.string().uuid(),
        strength: z.number().min(0).max(1).optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      log('info', 'atlas-api: upsertRelationship', { relationship: input.relationship });
      await ctx.worldSchemaStore.upsertRelationship(input);
      return { ok: true };
    }),
});

export type AppRouter = typeof appRouter;
