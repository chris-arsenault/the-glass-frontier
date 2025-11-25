import { log } from '@glass-frontier/utils';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context';

const t = initTRPC.context<Context>().create();

const kindSchema = z.object({
  id: z.string().min(1),
  category: z.string().optional(),
  displayName: z.string().optional(),
  defaultStatus: z.string().optional(),
  subkinds: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
});

const relationshipTypeSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
});

const relationshipRuleSchema = z.object({
  relationshipId: z.string().min(1),
  srcKind: z.string().min(1),
  dstKind: z.string().min(1),
});

export const appRouter = t.router({
  getSchema: t.procedure.query(async ({ ctx }) => {
    log('info', 'world-schema-api: getSchema');
    return ctx.worldSchemaStore.getWorldSchema();
  }),

  upsertKind: t.procedure
    .input(kindSchema)
    .mutation(async ({ ctx, input }) => {
      log('info', 'world-schema-api: upsertKind', { id: input.id });
      return ctx.worldSchemaStore.upsertKind({
        id: input.id as never,
        category: input.category ?? null,
        displayName: input.displayName ?? null,
        defaultStatus: input.defaultStatus as never,
        subkinds: input.subkinds as never,
        statuses: input.statuses as never,
      });
    }),

  addRelationshipType: t.procedure
    .input(relationshipTypeSchema)
    .mutation(async ({ ctx, input }) => {
      log('info', 'world-schema-api: addRelationshipType', { id: input.id });
      return ctx.worldSchemaStore.addRelationshipType({
        id: input.id,
        description: input.description ?? null,
      });
    }),

  upsertRelationshipRule: t.procedure
    .input(relationshipRuleSchema)
    .mutation(async ({ ctx, input }) => {
      log('info', 'world-schema-api: upsertRelationshipRule', { relationshipId: input.relationshipId });
      await ctx.worldSchemaStore.upsertRelationshipRule({
        relationshipId: input.relationshipId,
        srcKind: input.srcKind as never,
        dstKind: input.dstKind as never,
      });
      return { ok: true };
    }),

  deleteRelationshipRule: t.procedure
    .input(relationshipRuleSchema)
    .mutation(async ({ ctx, input }) => {
      log('info', 'world-schema-api: deleteRelationshipRule', { relationshipId: input.relationshipId });
      await ctx.worldSchemaStore.deleteRelationshipRule({
        relationshipId: input.relationshipId,
        srcKind: input.srcKind as never,
        dstKind: input.dstKind as never,
      });
      return { ok: true };
    }),
});

export type AppRouter = typeof appRouter;
