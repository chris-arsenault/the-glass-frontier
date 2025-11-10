import { initTRPC } from "@trpc/server";
import type { Context } from "./context";
import { z } from "zod";
import {TranscriptEntry, Turn} from "@glass-frontier/dto";
import {log} from "@glass-frontier/utils";

const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  // POST /sessions
  createSession: t.procedure
    .input(z.object({ sessionId: z.string().uuid().optional()}))
    .mutation(({ ctx, input }) => {
      log("info", `Ensuring session ${input.sessionId}`)
      const id = input.sessionId ?? crypto.randomUUID();
      const session = ctx.sessionStore.ensureSession(id);
      return { session }; // responseMeta sets 201
    }),

  // GET /sessions/:sessionId
  getSession: t.procedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(({ ctx, input }) => ctx.sessionStore.getSessionState(input.sessionId)),

  // POST /sessions/:sessionId/messages
  postMessage: t.procedure
    .input(z.object({
      sessionId: z.string().uuid(),
      content: TranscriptEntry, // tighten to your DTO schema
    }))
    .mutation(async ({ ctx, input }) => {
      const playerEntry = { ...input.content, role: "player" as const };
      const result: Turn = await ctx.engine.handlePlayerMessage(input.sessionId, playerEntry);
      return {
        gmMessage: result.gmMessage,
        playerIntent: result.playerIntent,
        systemMessage: result.systemMessage,
        skillCheckPlan: result.skillCheckPlan,
        skillCheckResult: result.skillCheckResult,
      };
    }),
});

export type AppRouter = typeof appRouter;