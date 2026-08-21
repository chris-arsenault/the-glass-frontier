import {
  TranscriptEntry,
} from '@glass-frontier/dto';
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context';

const t = initTRPC.context<Context>().create();
export const appRouter = t.router({

  // POST /chronicles/:chronicleId/messages
  postMessage: t.procedure
    .input(
      z.object({
        chronicleId: z.uuid(),
        content: TranscriptEntry
      })
    )
    .mutation(async ({ ctx, input }) => {
      const chronicle = await ctx.chronicleStore.getChronicle(input.chronicleId);
      if (chronicle === null || chronicle === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      if (chronicle.playerId !== ctx.identity.sub) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      if (chronicle?.status === 'closed') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Chronicle is closed.' });
      }
      const playerEntry = { ...input.content, role: 'player' as const };
      const result = await ctx.engine.handlePlayerMessage(input.chronicleId, playerEntry, {
        authorizationHeader: ctx.authorizationHeader
      });
      return {
        beats: result.beats,
        character: result.updatedCharacter,
        chronicleStatus: result.chronicleStatus,
        entityFocus: result.entityFocus,
        locationName: result.locationName,
        turn: result.turn,
      };
    }),

  setChronicleTargetEnd: t.procedure
    .input(
      z.object({
        chronicleId: z.string().uuid(),
        playerId: z.string().min(1),
        targetEndTurn: z.number().int().min(0).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const chronicle = await ctx.chronicleStore.getChronicle(input.chronicleId);
      if (chronicle === null || chronicle === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      if (input.playerId !== ctx.identity.sub || chronicle.playerId !== ctx.identity.sub) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      if (chronicle.status === 'closed') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Chronicle is closed.' });
      }
      const updated = await ctx.chronicleStore.setChronicleTargetEnd(
        input.chronicleId,
        typeof input.targetEndTurn === 'number' ? input.targetEndTurn : null
      );
      return { chronicle: updated };
    }),
});


export type AppRouter = typeof appRouter;
