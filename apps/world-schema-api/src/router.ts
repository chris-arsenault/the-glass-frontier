import {
  HardStateKind,
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

const kindSchema = z.object({
  category: z.string().nullish(),
  defaultStatus: HardStateStatus.nullish(),
  displayName: z.string().nullish(),
  id: HardStateKind,
  statuses: z.array(HardStateStatus).optional(),
  subkinds: z.array(HardStateSubkind).optional(),
});

const relationshipTypeSchema = z.object({
  description: z.string().optional(),
  id: z.string().min(1),
});

const relationshipRuleSchema = z.object({
  dstKind: HardStateKind,
  relationshipId: z.string().min(1),
  srcKind: HardStateKind,
});

export const appRouter = t.router({
  addRelationshipType: moderatorProcedure
    .input(relationshipTypeSchema)
    .mutation(async ({ ctx, input }) => {
      log('info', 'world-schema-api: addRelationshipType', { id: input.id });
      return ctx.worldSchemaStore.addRelationshipType({
        description: input.description ?? null,
        id: input.id,
      });
    }),

  deleteRelationshipRule: moderatorProcedure
    .input(relationshipRuleSchema)
    .mutation(async ({ ctx, input }) => {
      log('info', 'world-schema-api: deleteRelationshipRule', { relationshipId: input.relationshipId });
      await ctx.worldSchemaStore.deleteRelationshipRule({
        dstKind: input.dstKind,
        relationshipId: input.relationshipId,
        srcKind: input.srcKind,
      });
      return { ok: true };
    }),

  getSchema: t.procedure.query(async ({ ctx }) => {
    log('info', 'world-schema-api: getSchema');
    return ctx.worldSchemaStore.getWorldSchema();
  }),

  upsertKind: moderatorProcedure
    .input(kindSchema)
    .mutation(async ({ ctx, input }) => {
      log('info', 'world-schema-api: upsertKind', { id: input.id });
      return ctx.worldSchemaStore.upsertKind({
        category: input.category ?? null,
        defaultStatus: input.defaultStatus,
        displayName: input.displayName ?? null,
        id: input.id,
        statuses: input.statuses,
        subkinds: input.subkinds,
      });
    }),

  upsertRelationshipRule: moderatorProcedure
    .input(relationshipRuleSchema)
    .mutation(async ({ ctx, input }) => {
      log('info', 'world-schema-api: upsertRelationshipRule', { relationshipId: input.relationshipId });
      await ctx.worldSchemaStore.upsertRelationshipRule({
        dstKind: input.dstKind,
        relationshipId: input.relationshipId,
        srcKind: input.srcKind,
      });
      return { ok: true };
    }),
});

export type AppRouter = typeof appRouter;
