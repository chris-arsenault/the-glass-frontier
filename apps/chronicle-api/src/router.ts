import type {
  Player,
  PlayerPreferences,
} from '@glass-frontier/dto';
import {
  CharacterDraft,
  type Character,
  BugReportSubmissionSchema,
  BUG_REPORT_STATUSES,
  PlayerPreferencesSchema,
} from '@glass-frontier/dto';
import { toLLMPlayer } from '@glass-frontier/llm-client';
import { hasAnyGroup } from '@glass-frontier/node-utils';
import { log } from '@glass-frontier/utils';
import { buildInitialEntityRoster } from '@glass-frontier/worldstate';
import { initTRPC, TRPCError } from '@trpc/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { buildCharacter } from './characterCreation';
import type { Context } from './context';

type EnsureChronicleResult = Awaited<
  ReturnType<Context['chronicleStore']['ensureChronicle']>
>;
type ChronicleSnapshot = Awaited<
  ReturnType<Context['chronicleStore']['getChronicleState']>
>;

const t = initTRPC.context<Context>().create();
const MEMBER_GROUPS = ['admin', 'moderator', 'user'] as const;
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
    characterId: z.string().min(1),
    chronicleId: z.string().uuid().optional(),
    location: locationDetailsSchema,
    locationId: z.string().uuid(),
    playerId: z.string().min(1),
    seedText: z.string().trim().min(1).max(800),
    status: z.enum(['open', 'closed']).optional(),
    title: z.string().min(1),
  })
  .merge(toneSchema);

type CreateChronicleInput = z.infer<typeof createChronicleInputSchema>;

const ensurePlayerRecord = async (ctx: Context, playerId: string): Promise<Player> => {
  return ctx.playerStore.ensure(playerId);
};

export const appRouter = t.router({
  branchChronicle: t.procedure
    .input(
      z.object({
        chronicleId: z.string().uuid(),
        playerId: z.string().min(1),
        turnSequence: z.number().int().nonnegative(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const playerId = requireCurrentPlayer(ctx, input.playerId);
      const source = await ctx.chronicleStore.getChronicle(input.chronicleId);
      if (source === null) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Chronicle not found.' });
      }
      if (source.playerId !== playerId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      if (source.status !== 'open') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only active chronicles can be branched.',
        });
      }
      const chronicle = await ctx.chronicleStore.branchChronicleFromTurn({
        chronicleId: source.id,
        playerId,
        turnSequence: input.turnSequence,
      });
      return { chronicle };
    }),

  createCharacter: t.procedure
    .input(z.object({ draft: CharacterDraft, playerId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const playerId = requireCurrentPlayer(ctx, input.playerId);
      log('info', `Creating Character ${input.draft.name}`);
      await ctx.playerStore.ensure(playerId);
      const character = await buildCharacter(ctx, input.draft, playerId);
      return { character: await ctx.chronicleStore.upsertCharacter(character) };
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
          characterId: z.string().min(1),
          count: z.number().int().positive().max(5).optional(),
          locationId: z.string().uuid(),
          playerId: z.string().min(1),
        })
        .merge(toneSchema)
    )
    .mutation(async ({ ctx, input }) => {
      const playerId = requireCurrentPlayer(ctx, input.playerId);
      const character = await requireCharacter(ctx, input.characterId);
      ensureCharacterOwnership(character, playerId);
      return ctx.seedService.generateSeeds({
        anchorId: input.anchorId,
        character,
        count: input.count,
        locationId: input.locationId,
        player: toLLMPlayer(ctx.identity),
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
      // Prose returns one entry per configured slot, each carrying its slot:
      // an absent slot is a player declining that shadow, not a gap to close.
      const prose = await ctx.modelConfigStore.listModelsForCategory('prose', playerId);
      const classification = await ctx.modelConfigStore.getModelForCategory('classification', playerId);
      return {
        categories: {
          classification,
          proseSlots: prose,
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

  // Cross-player by design. Only member-or-higher viewers receive open chronicles.
  listChronicleActivity: t.procedure.query(async ({ ctx }) =>
    ctx.chronicleStore.listChronicleActivity(hasAnyGroup(ctx.identity, MEMBER_GROUPS))
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
        // Null clears the slot. Only a shadow slot may be cleared: a chronicle
        // with no primary prose model has nothing to write the turn with.
        modelId: z.string().min(1).nullable(),
        playerId: z.string().min(1),
        slot: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const playerId = requireCurrentPlayer(ctx, input.playerId);
      if (input.slot !== 1 && input.category !== 'prose') {
        throw new Error('Only prose has more than one model slot.');
      }
      if (input.modelId === null) {
        if (input.slot === 1) {
          throw new Error('The primary model writes the turn and cannot be cleared.');
        }
        await ctx.modelConfigStore.clearCategoryModel(input.category, playerId, input.slot);
        return { success: true };
      }
      await ctx.modelConfigStore.setCategoryModel(
        input.category, input.modelId, playerId, input.slot
      );
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
  const [opening, entityRoster] = await Promise.all([
    ctx.seedService.generateOpening({
      anchorId: input.anchorEntityId,
      character,
      chronicleId,
      locationId: input.locationId,
      player: toLLMPlayer(ctx.identity),
      playerId,
      seedText: input.seedText,
      title: input.title,
      toneChips: input.toneChips,
      toneNotes: input.toneNotes,
    }),
    buildInitialEntityRoster(ctx.worldSchemaStore, {
      anchorId: input.anchorEntityId,
      locationId: input.locationId,
      locationName: input.location.locale.trim(),
    }),
  ]);
  const chronicle = await ctx.chronicleStore.ensureChronicle({
    anchorEntityId: input.anchorEntityId,
    characterId: input.characterId,
    chronicleId,
    entityRoster,
    locationId: input.locationId,
    locationName: input.location.locale.trim(),
    openingReferenceSlugs: opening.openingReferenceSlugs,
    openingText: opening.text,
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
