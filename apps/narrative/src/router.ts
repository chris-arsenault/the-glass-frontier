import { randomUUID } from "node:crypto";
import { initTRPC } from "@trpc/server";
import type { Context } from "./context";
import { z } from "zod";
import { Character as CharacterSchema, TranscriptEntry } from "@glass-frontier/dto";
import { log } from "@glass-frontier/utils";

const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  // POST /chronicles
  createChronicle: t.procedure
    .input(
      z.object({
        chronicleId: z.string().uuid().optional(),
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
      const character = await ctx.worldDataStore.getCharacter(input.characterId);
      if (!character) {
        throw new Error("Character not found for chronicle creation.");
      }
      if (character.loginId !== input.loginId) {
        throw new Error("Character does not belong to the requesting login.");
      }

      const location = await ctx.worldDataStore.upsertLocation({
        id: randomUUID(),
        locale: input.location.locale,
        atmosphere: input.location.atmosphere,
        description: undefined,
        metadata: undefined
      });

      const chronicle = await ctx.worldDataStore.ensureChronicle({
        chronicleId: input.chronicleId,
        loginId: input.loginId,
        locationId: location.id,
        characterId: input.characterId,
        title: input.title,
        status: input.status
      });
      log("info", `Ensuring chronicle ${chronicle.id} for login ${chronicle.loginId}`);
      return { chronicle }; // responseMeta sets 201
    }),

  // GET /chronicles/:chronicleId
  getChronicle: t.procedure
    .input(z.object({ chronicleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => ctx.worldDataStore.getChronicleState(input.chronicleId)),

  // POST /chronicles/:chronicleId/messages
  postMessage: t.procedure
    .input(
      z.object({
        chronicleId: z.string().uuid(),
        content: TranscriptEntry // tighten to your DTO schema
      })
    )
    .mutation(async ({ ctx, input }) => {
      const playerEntry = { ...input.content, role: "player" as const };
      const result = await ctx.engine.handlePlayerMessage(input.chronicleId, playerEntry, {
        authorizationHeader: ctx.authorizationHeader
      });
      return { turn: result.turn, character: result.updatedCharacter };
    }),

  listCharacters: t.procedure
    .input(z.object({ loginId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.worldDataStore.listCharactersByLogin(input.loginId)),

  createCharacter: t.procedure
    .input(CharacterSchema)
    .mutation(async ({ ctx, input }) => {
      log("info", `Creating Character ${input.name}`);
      const character = await ctx.worldDataStore.upsertCharacter(input);
      return { character };
    }),

  listChronicles: t.procedure
    .input(z.object({ loginId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.worldDataStore.listChroniclesByLogin(input.loginId)),
});

export type AppRouter = typeof appRouter;
