import {
  TranscriptEntry,
} from '@glass-frontier/dto';
import { initTRPC } from '@trpc/server';
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
      const chronicle = await ctx.worldStateStore.getChronicle(input.chronicleId);
      if (chronicle?.status === 'closed') {
        throw new Error('Chronicle is closed.');
      }
      const playerEntry = { ...input.content, role: 'player' as const };
      const result = await ctx.engine.handlePlayerMessage(input.chronicleId, playerEntry, {
        authorizationHeader: ctx.authorizationHeader
      });
      return {
        character: result.updatedCharacter,
        chronicleStatus: result.chronicleStatus,
        location: result.locationSummary,
        turn: result.turn,
      };
    }),

  setChronicleTargetEnd: t.procedure
    .input(
      z.object({
        chronicleId: z.string().uuid(),
        loginId: z.string().min(1),
        targetEndTurn: z.number().int().min(0).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const chronicle = await ctx.worldStateStore.getChronicle(input.chronicleId);
      if (chronicle === null || chronicle === undefined) {
        throw new Error('Chronicle not found.');
      }
      if (chronicle.loginId !== input.loginId) {
        throw new Error('Chronicle does not belong to the requesting login.');
      }
      const normalizedTarget =
        typeof input.targetEndTurn === 'number' ? input.targetEndTurn : undefined;
      const updated = await ctx.worldStateStore.upsertChronicle({
        ...chronicle,
        targetEndTurn: normalizedTarget,
      });
      return { chronicle: updated };
    }),
});


export type AppRouter = typeof appRouter;
