import { randomUUID } from 'node:crypto';
import { initTRPC } from '@trpc/server';
import type { Context } from './context';
import { z } from 'zod';
import {
  Character as CharacterSchema,
  TranscriptEntry,
  PromptTemplateIds,
  type PromptTemplateId,
  PendingEquip,
} from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';

const t = initTRPC.context<Context>().create();
const templateIdSchema = z.enum(PromptTemplateIds as [PromptTemplateId, ...PromptTemplateId[]]);

export const appRouter = t.router({
  // POST /chronicles
  createChronicle: t.procedure
    .input(
      z.object({
        chronicleId: z.string().uuid().optional(),
        locationId: z.string().uuid().optional(),
        loginId: z.string().min(1),
        characterId: z.string().min(1),
        title: z.string().min(1),
        location: z.object({
          locale: z.string().min(1),
          atmosphere: z.string().min(1),
        }),
        status: z.enum(['open', 'closed']).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const character = await ctx.worldStateStore.getCharacter(input.characterId);
      if (!character) {
        throw new Error('Character not found for chronicle creation.');
      }
      if (character.loginId !== input.loginId) {
        throw new Error('Character does not belong to the requesting login.');
      }

      const chronicleId = input.chronicleId ?? randomUUID();
      const locationRoot = await ctx.locationGraphStore.ensureLocation({
        locationId: input.locationId,
        name: input.location.locale,
        description: input.location.atmosphere,
        tags: deriveLocationTags(input.location.atmosphere),
        characterId: input.characterId,
        kind: 'locale',
      });

      const chronicle = await ctx.worldStateStore.ensureChronicle({
        chronicleId,
        loginId: input.loginId,
        locationId: locationRoot.locationId,
        characterId: input.characterId,
        title: input.title,
        status: input.status,
      });
      log('info', `Ensuring chronicle ${chronicle.id} for login ${chronicle.loginId}`);
      return { chronicle }; // responseMeta sets 201
    }),

  // GET /chronicles/:chronicleId
  getChronicle: t.procedure
    .input(z.object({ chronicleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => augmentChronicleSnapshot(ctx, input.chronicleId)),

  // POST /chronicles/:chronicleId/messages
  postMessage: t.procedure
    .input(
      z.object({
        chronicleId: z.string().uuid(),
        content: TranscriptEntry, // tighten to your DTO schema
        pendingEquip: z.array(PendingEquip).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const playerEntry = { ...input.content, role: 'player' as const };
      const result = await ctx.engine.handlePlayerMessage(input.chronicleId, playerEntry, {
        authorizationHeader: ctx.authorizationHeader,
        pendingEquip: input.pendingEquip ?? [],
      });
      return {
        turn: result.turn,
        character: result.updatedCharacter,
        location: result.locationSummary,
      };
    }),

  listCharacters: t.procedure
    .input(z.object({ loginId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.worldStateStore.listCharactersByLogin(input.loginId)),

  createCharacter: t.procedure.input(CharacterSchema).mutation(async ({ ctx, input }) => {
    log('info', `Creating Character ${input.name}`);
    const character = await ctx.worldStateStore.upsertCharacter(input);
    return { character };
  }),

  listChronicles: t.procedure
    .input(z.object({ loginId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.worldStateStore.listChroniclesByLogin(input.loginId)),

  listPromptTemplates: t.procedure
    .input(z.object({ loginId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.templateManager.listTemplates(input.loginId)),

  getPromptTemplate: t.procedure
    .input(
      z.object({
        loginId: z.string().min(1),
        templateId: templateIdSchema,
      })
    )
    .query(async ({ ctx, input }) =>
      ctx.templateManager.getTemplate(input.loginId, input.templateId)
    ),

  savePromptTemplate: t.procedure
    .input(
      z.object({
        loginId: z.string().min(1),
        templateId: templateIdSchema,
        editable: z.string().min(1),
        label: z.string().max(64).optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      ctx.templateManager.saveTemplate({
        loginId: input.loginId,
        templateId: input.templateId,
        editable: input.editable,
        label: input.label,
      })
    ),

  revertPromptTemplate: t.procedure
    .input(
      z.object({
        loginId: z.string().min(1),
        templateId: templateIdSchema,
      })
    )
    .mutation(async ({ ctx, input }) =>
      ctx.templateManager.revertTemplate({ loginId: input.loginId, templateId: input.templateId })
    ),
});

async function augmentChronicleSnapshot(ctx: Context, chronicleId: string) {
  const snapshot = await ctx.worldStateStore.getChronicleState(chronicleId);
  if (!snapshot) {
    return null;
  }
  const characterId = snapshot.chronicle.characterId ?? snapshot.character?.id ?? null;
  const locationId = snapshot.chronicle.locationId;
  if (characterId && locationId) {
    snapshot.location =
      (await ctx.locationGraphStore.summarizeCharacterLocation({
        locationId,
        characterId,
      })) ?? null;
  }
  return snapshot;
}

function deriveLocationTags(atmosphere: string): string[] {
  if (!atmosphere) {
    return [];
  }
  return atmosphere
    .split(/[,.]/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 1)
    .slice(0, 6);
}

export type AppRouter = typeof appRouter;
