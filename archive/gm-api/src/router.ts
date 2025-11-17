import { TranscriptEntrySchema } from '@glass-frontier/worldstate';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context';

const t = initTRPC.context<Context>().create();

const PlayerTranscriptSchema = TranscriptEntrySchema.omit({ role: true }).extend({
  role: z.literal('player').default('player'),
});

const processPlayerTurnInputSchema = z.object({
  chronicleId: z.string().uuid('chronicleId must be a UUID'),
  playerMessage: PlayerTranscriptSchema,
});

export const appRouter = t.router({
  processPlayerTurn: t.procedure
    .input(processPlayerTurnInputSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.worldstateSessionFactory.create(input.chronicleId);
      const playerMessage = PlayerTranscriptSchema.parse(input.playerMessage);

      return ctx.gmEngine.processPlayerTurn({
        authorizationHeader: ctx.authorizationHeader,
        chronicleId: input.chronicleId,
        playerMessage,
        session,
      });
    }),
});

export type AppRouter = typeof appRouter;
