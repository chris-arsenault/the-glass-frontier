import type { Player, PlayerPreferences } from '@glass-frontier/dto';
import {
  Character as CharacterSchema,
  type Character,
  BugReportSubmissionSchema,
  BUG_REPORT_STATUSES,
  PlayerPreferencesSchema,
} from '@glass-frontier/dto';
import { hasAnyGroup } from '@glass-frontier/node-utils';
import { log } from '@glass-frontier/utils';
import { initTRPC, TRPCError } from '@trpc/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { Context } from './context';

type EnsureChronicleResult = Awaited<
  ReturnType<Context['chronicleStore']['ensureChronicle']>
>;
type ChronicleSnapshot = Awaited<
  ReturnType<Context['chronicleStore']['getChronicleState']>
>;

const t = initTRPC.context<Context>().create();
const moderatorProcedure = t.procedure.use(({ ctx, next }) => {
  if (!hasAnyGroup(ctx.identity, ['admin', 'moderator'])) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});
const normalizePlayerPreferences = (prefs?: PlayerPreferences | null): PlayerPreferences => ({
  feedbackVisibility: prefs?.feedbackVisibility ?? 'all',
});
const locationDetailsSchema = z.object({
  locale: z.string().min(1),
});

const toneSchema = z.object({
  toneChips: z.array(z.string()).max(8).optional(),
  toneNotes: z.string().max(240).optional(),
});

const createChronicleInputSchema = z
  .object({
    anchorEntityId: z.string().uuid().optional(),
    beatsEnabled: z.boolean().optional(),
    characterId: z.string().min(1),
    chronicleId: z.string().uuid().optional(),
    location: locationDetailsSchema,
    locationId: z.string().uuid().optional(),
    playerId: z.string().min(1),
    seedText: z.string().max(800).optional(),
    status: z.enum(['open', 'closed']).optional(),
    title: z.string().min(1),
  })
  .merge(toneSchema);

type CreateChronicleInput = z.infer<typeof createChronicleInputSchema>;

const ensurePlayerRecord = async (ctx: Context, playerId: string): Promise<Player> => {
  return ctx.playerStore.ensure(playerId);
};

export const appRouter = t.router({
  createCharacter: t.procedure.input(CharacterSchema).mutation(async ({ ctx, input }) => {
    const playerId = requireCurrentPlayer(ctx, input.playerId);
    log('info', `Creating Character ${input.name}`);
    await ctx.playerStore.ensure(playerId);
    const character = await ctx.chronicleStore.upsertCharacter({ ...input, playerId });
    return { character };
  }),
  // POST /chronicles
  createChronicle: t.procedure
    .input(createChronicleInputSchema)
    .mutation(async ({ ctx, input }) => createChronicleHandler(ctx, input)),

  deleteChronicle: t.procedure
    .input(
      z.object({
        chronicleId: z.string().uuid(),
        playerId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const playerId = requireCurrentPlayer(ctx, input.playerId);
      const chronicle = await ctx.chronicleStore.getChronicle(input.chronicleId);
      if (chronicle === null || chronicle === undefined) {
        return { chronicleId: input.chronicleId, deleted: false };
      }
      if (chronicle.playerId !== playerId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      await ctx.chronicleStore.deleteChronicle(input.chronicleId);
      return { chronicleId: input.chronicleId, deleted: true };
    }),

  generateChronicleSeeds: t.procedure
    .input(
      z
        .object({
          anchorId: z.string().uuid(),
          count: z.number().int().positive().max(5).optional(),
          locationId: z.string().uuid(),
          playerId: z.string().min(1),
        })
        .merge(toneSchema)
    )
    .mutation(async ({ ctx, input }) => {
      const playerId = requireCurrentPlayer(ctx, input.playerId);
      return ctx.seedService.generateSeeds({
        anchorId: input.anchorId,
        count: input.count,
        locationId: input.locationId,
        playerId,
        toneChips: input.toneChips,
        toneNotes: input.toneNotes,
      });
    }),

  // GET /chronicles/:chronicleId
  getChronicle: t.procedure
    .input(z.object({ chronicleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => getOwnedChronicleSnapshot(ctx, input.chronicleId)),

  getModelUsageCostSummary: t.procedure
    .input(
      z.object({
        endDate: z.string().optional(),
        playerId: z.string().min(1),
        startDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const playerId = requireCurrentPlayer(ctx, input.playerId);
      const startDate = input.startDate === undefined ? undefined : new Date(input.startDate);
      const endDate = input.endDate === undefined ? undefined : new Date(input.endDate);
      const summary = await ctx.modelConfigStore.getUsageCostSummary(
        playerId,
        startDate,
        endDate
      );
      return { summary };
    }),

  getPlayerModelCategories: t.procedure
    .input(z.object({ playerId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const playerId = requireCurrentPlayer(ctx, input.playerId);
      const prose = await ctx.modelConfigStore.getModelForCategory('prose', playerId);
      const classification = await ctx.modelConfigStore.getModelForCategory('classification', playerId);
      return {
        categories: {
          classification,
          prose
        }
      };
    }),

  getPlayerSettings: t.procedure
    .input(z.object({ playerId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const player = await ensurePlayerRecord(ctx, requireCurrentPlayer(ctx, input.playerId));
      return { preferences: normalizePlayerPreferences(player.preferences) };
    }),

  getTokenUsageSummary: t.procedure
    .input(
      z.object({
        limit: z.number().int().positive().max(12).optional(),
        playerId: z.string().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const playerId = requireCurrentPlayer(ctx, input.playerId);
      const limit = Math.min(input.limit ?? 6, 12);
      const usage = await ctx.tokenUsageStore.listUsage(playerId, limit);
      return { usage };
    }),

  listBugReports: moderatorProcedure.query(async ({ ctx }) => {
    const reports = await ctx.bugReportStore.listReports();
    return { reports };
  }),

  listCharacters: t.procedure
    .input(z.object({ playerId: z.string().min(1) }))
    .query(async ({ ctx, input }) =>
      ctx.chronicleStore.listCharactersByPlayer(requireCurrentPlayer(ctx, input.playerId))
    ),

  listChronicles: t.procedure
    .input(z.object({ playerId: z.string().min(1) }))
    .query(async ({ ctx, input }) =>
      ctx.chronicleStore.listChroniclesByPlayer(requireCurrentPlayer(ctx, input.playerId))
    ),

  listModels: t.procedure
    .query(async ({ ctx }) => {
      const models = await ctx.modelConfigStore.listModels();
      return { models };
    }),

  setPlayerModelCategory: t.procedure
    .input(
      z.object({
        category: z.enum(['prose', 'classification']),
        modelId: z.string().min(1),
        playerId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const playerId = requireCurrentPlayer(ctx, input.playerId);
      await ctx.modelConfigStore.setCategoryModel(input.category, input.modelId, playerId);
      return { success: true };
    }),

  submitBugReport: t.procedure
    .input(
      BugReportSubmissionSchema.extend({
        characterId: z.string().uuid().optional().nullable(),
        chronicleId: z.string().uuid().optional().nullable(),
        playerId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const playerId = requireCurrentPlayer(ctx, input.playerId);
      const report = await ctx.bugReportStore.createReport({
        characterId: input.characterId ?? null,
        chronicleId: input.chronicleId ?? null,
        details: input.details,
        playerId,
        summary: input.summary,
      });
      return { report };
    }),

  updateBugReport: moderatorProcedure
    .input(
      z.object({
        adminNotes: z.string().max(4000).nullable().optional(),
        backlogItem: z.string().max(240).nullable().optional(),
        reportId: z.string().uuid(),
        status: z.enum(BUG_REPORT_STATUSES).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.bugReportStore.updateReport(input.reportId, {
        adminNotes: input.adminNotes,
        backlogItem: input.backlogItem,
        status: input.status,
      });
      return { report };
    }),

  updatePlayerSettings: t.procedure
    .input(
      z.object({
        playerId: z.string().min(1),
        preferences: PlayerPreferencesSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const playerId = requireCurrentPlayer(ctx, input.playerId);
      const preferences = normalizePlayerPreferences(input.preferences);
      await ctx.playerStore.setPreferences(playerId, preferences);
      return { preferences };
    }),

});

async function createChronicleHandler(
  ctx: Context,
  input: CreateChronicleInput
): Promise<{ chronicle: EnsureChronicleResult }> {
  const playerId = requireCurrentPlayer(ctx, input.playerId);
  await ctx.playerStore.ensure(playerId);
  const character = await requireCharacter(ctx, input.characterId);
  ensureCharacterOwnership(character, playerId);

  const chronicleId = input.chronicleId ?? randomUUID();
  const chronicle = await ctx.chronicleStore.ensureChronicle({
    anchorEntityId: input.anchorEntityId,
    beatsEnabled: input.beatsEnabled,
    characterId: input.characterId,
    chronicleId,
    locationId: input.locationId,
    locationName: input.location.locale.trim(),
    playerId,
    seedText: input.seedText,
    status: input.status,
    title: input.title,
    toneChips: input.toneChips,
    toneNotes: input.toneNotes,
  });

  log('info', `Chronicle ${chronicle.id} created for player ${chronicle.playerId}`);
  return { chronicle };
}

async function requireCharacter(ctx: Context, characterId: string): Promise<Character> {
  const character = await ctx.chronicleStore.getCharacter(characterId);
  if (character === null || character === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Character not found for chronicle creation.' });
  }
  return character;
}

function ensureCharacterOwnership(character: Character, playerId: string): void {
  if (character.playerId !== playerId) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
}


async function getOwnedChronicleSnapshot(
  ctx: Context,
  chronicleId: string
): Promise<ChronicleSnapshot> {
  const snapshot = await ctx.chronicleStore.getChronicleState(chronicleId);
  if (snapshot !== null && snapshot.chronicle.playerId !== ctx.identity.sub) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return snapshot;
}

function requireCurrentPlayer(ctx: Context, claimedPlayerId: string): string {
  if (claimedPlayerId !== ctx.identity.sub) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return ctx.identity.sub;
}

export type AppRouter = typeof appRouter;
