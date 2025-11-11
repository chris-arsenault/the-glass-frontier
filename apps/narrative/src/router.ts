import { randomUUID } from "node:crypto";
import { initTRPC } from "@trpc/server";
import type { Context } from "./context";
import { z } from "zod";
import { Character as CharacterSchema, TranscriptEntry, Turn } from "@glass-frontier/dto";
import { log } from "@glass-frontier/utils";

const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  // POST /sessions
  createSession: t.procedure
    .input(
      z.object({
        sessionId: z.string().uuid().optional(),
        loginId: z.string().min(1),
        characterId: z.string().min(1),
        title: z.string().min(1),
        location: z.object({
          locale: z.string().min(1),
          atmosphere: z.string().min(1)
        }),
        status: z.enum(["open", "closed"]).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const character = await ctx.sessionStore.getCharacter(input.characterId);
      if (!character) {
        throw new Error("Character not found for session creation.");
      }
      if (character.loginId !== input.loginId) {
        throw new Error("Character does not belong to the requesting login.");
      }

      const location = await ctx.sessionStore.upsertLocation({
        id: randomUUID(),
        locale: input.location.locale,
        atmosphere: input.location.atmosphere,
        description: undefined,
        metadata: undefined
      });

      const session = await ctx.sessionStore.ensureSession({
        sessionId: input.sessionId,
        loginId: input.loginId,
        locationId: location.id,
        characterId: input.characterId,
        title: input.title,
        status: input.status
      });
      log("info", `Ensuring session ${session.id} for login ${session.loginId}`);
      return { session }; // responseMeta sets 201
    }),

  // GET /sessions/:sessionId
  getSession: t.procedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => ctx.sessionStore.getSessionState(input.sessionId)),

  // POST /sessions/:sessionId/messages
  postMessage: t.procedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        content: TranscriptEntry // tighten to your DTO schema
      })
    )
    .mutation(async ({ ctx, input }) => {
      const playerEntry = { ...input.content, role: "player" as const };
      const result: Turn = await ctx.engine.handlePlayerMessage(input.sessionId, playerEntry, {
        authorizationHeader: ctx.authorizationHeader
      });
      return { turn: result };
    }),

  listCharacters: t.procedure
    .input(z.object({ loginId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.sessionStore.listCharactersByLogin(input.loginId)),

  createCharacter: t.procedure
    .input(CharacterSchema)
    .mutation(async ({ ctx, input }) => {
      log("info", `Creating Character ${input.name}`);
      const character = await ctx.sessionStore.upsertCharacter(input);
      return { character };
    }),

  listSessions: t.procedure
    .input(z.object({ loginId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.sessionStore.listSessionsByLogin(input.loginId)),
});

export type AppRouter = typeof appRouter;
