import type { Player, PlayerPreferences } from '@glass-frontier/dto';
import {
  Character as CharacterSchema,
  type Character,
  BugReportSubmissionSchema,
  BUG_REPORT_STATUSES,
  PlayerPreferencesSchema,
  type TokenUsagePeriod,
} from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import { initTRPC } from '@trpc/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { Context } from './context';

type EnsureChronicleResult = Awaited<
  ReturnType<Context['chronicleStore']['ensureChronicle']>
>;

const t = initTRPC.context<Context>().create();
const normalizePlayerPreferences = (prefs?: PlayerPreferences | null): PlayerPreferences => ({
  feedbackVisibility: prefs?.feedbackVisibility ?? 'all',
});
const locationDetailsSchema = z.object({
  atmosphere: z.string().min(1),
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
    location: locationDetailsSchema.optional(),
    locationId: z.string().uuid().optional(),
    playerId: z.string().min(1),
    seedText: z.string().max(800).optional(),
    status: z.enum(['open', 'closed']).optional(),
    title: z.string().min(1),
  })
  .refine(
    (payload) => Boolean(payload.locationId) || Boolean(payload.location),
    {
      message: 'Provide locationId or location details.',
      path: ['locationId'],
    }
  );

type CreateChronicleInput = z.infer<typeof createChronicleInputSchema>;

const ensurePlayerRecord = async (ctx: Context, playerId: string): Promise<Player> => {
  return ctx.playerStore.ensure(playerId);
};

export const appRouter = t.router({
  createCharacter: t.procedure.input(CharacterSchema).mutation(async ({ ctx, input }) => {
    log('info', `Creating Character ${input.name}`);
    await ctx.playerStore.ensure(input.playerId);
    const character = await ctx.chronicleStore.upsertCharacter(input);
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
      const chronicle = await ctx.chronicleStore.getChronicle(input.chronicleId);
      if (chronicle === null || chronicle === undefined) {
        return { chronicleId: input.chronicleId, deleted: false };
      }
      if (chronicle.playerId !== input.playerId) {
        throw new Error('Chronicle does not belong to the requesting player.');
      }
      await ctx.chronicleStore.deleteChronicle(input.chronicleId);
      return { chronicleId: input.chronicleId, deleted: true };
    }),

  generateChronicleSeeds: t.procedure
    .input(
      z
        .object({
          count: z.number().int().positive().max(5).optional(),
          locationId: z.string().uuid(),
          anchorId: z.string().uuid(),
          playerId: z.string().min(1),
        })
        .merge(toneSchema)
    )
    .mutation(async ({ ctx, input }) =>
      ctx.seedService.generateSeeds({
        authorizationHeader: ctx.authorizationHeader,
        count: input.count,
        locationId: input.locationId,
        anchorId: input.anchorId,
        playerId: input.playerId,
        toneChips: input.toneChips,
        toneNotes: input.toneNotes,
      })
    ),

  // GET /chronicles/:chronicleId
  getChronicle: t.procedure
    .input(z.object({ chronicleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => augmentChronicleSnapshot(ctx, input.chronicleId)),

  getPlayerSettings: t.procedure
    .input(z.object({ playerId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const player = await ensurePlayerRecord(ctx, input.playerId);
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
      const limit = Math.min(input.limit ?? 6, 12);
      const usage = await ctx.tokenUsageStore.listUsage(input.playerId, limit);
      return { usage };
    }),

  listBugReports: t.procedure.query(async ({ ctx }) => {
    const reports = await ctx.bugReportStore.listReports();
    return { reports };
  }),

  listCharacters: t.procedure
    .input(z.object({ playerId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.chronicleStore.listCharactersByPlayer(input.playerId)),

  listChronicles: t.procedure
    .input(z.object({ playerId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.chronicleStore.listChroniclesByPlayer(input.playerId)),

  submitBugReport: t.procedure
    .input(
      BugReportSubmissionSchema.extend({
        characterId: z.string().uuid().optional().nullable(),
        chronicleId: z.string().uuid().optional().nullable(),
        playerId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.bugReportStore.createReport({
        characterId: input.characterId ?? null,
        chronicleId: input.chronicleId ?? null,
        details: input.details,
        playerId: input.playerId,
        summary: input.summary,
      });
      return { report };
    }),

  updateBugReport: t.procedure
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
      const preferences = normalizePlayerPreferences(input.preferences);
      await ctx.playerStore.setPreferences(input.playerId, preferences);
      return { preferences };
    }),

  listModels: t.procedure
    .query(async ({ ctx }) => {
      const models = await ctx.modelConfigStore.listModels();
      return { models };
    }),

  getPlayerModelCategories: t.procedure
    .input(z.object({ playerId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const prose = await ctx.modelConfigStore.getModelForCategory('prose', input.playerId);
      const classification = await ctx.modelConfigStore.getModelForCategory('classification', input.playerId);
      return {
        categories: {
          prose,
          classification
        }
      };
    }),

  setPlayerModelCategory: t.procedure
    .input(
      z.object({
        playerId: z.string().min(1),
        category: z.enum(['prose', 'classification']),
        modelId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.modelConfigStore.setCategoryModel(input.category, input.modelId, input.playerId);
      return { success: true };
    }),

  getModelUsageCostSummary: t.procedure
    .input(
      z.object({
        playerId: z.string().min(1),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const startDate = input.startDate ? new Date(input.startDate) : undefined;
      const endDate = input.endDate ? new Date(input.endDate) : undefined;
      const summary = await ctx.modelConfigStore.getUsageCostSummary(
        input.playerId,
        startDate,
        endDate
      );
      return { summary };
    }),

});

async function createChronicleHandler(
  ctx: Context,
  input: CreateChronicleInput
): Promise<{ chronicle: EnsureChronicleResult }> {
  const startTime = Date.now();
  const logTiming = (step: string) => {
    log('info', `createChronicle timing: ${step}`, { elapsedMs: Date.now() - startTime });
  };

  log('info', 'createChronicle: starting', { input: { ...input, seedText: input.seedText?.slice(0, 50) } });

  logTiming('start - ensuring player');
  await ctx.playerStore.ensure(input.playerId);
  logTiming('player ensured');

  logTiming('fetching character');
  const character = await requireCharacter(ctx, input.characterId);
  logTiming('character fetched');
  ensureCharacterOwnership(character, input.playerId);

  const chronicleId = input.chronicleId ?? randomUUID();

  // Only create a new location if locationId wasn't provided
  // If locationId is provided, use the existing location from worldstate
  let locationId = input.locationId;
  if (!locationId) {
    locationId = randomUUID();
    const locationName = resolveLocationName(input);
    logTiming('creating new location entity');
    await ctx.worldSchemaStore.upsertEntity({
      id: locationId,
      kind: 'location',
      name: locationName,
      status: 'known',
    });
    logTiming('location entity created');
  } else {
    logTiming('using existing locationId');
  }

  logTiming('calling ensureChronicle');
  const chronicle = await ctx.chronicleStore.ensureChronicle({
    anchorEntityId: input.anchorEntityId,
    beatsEnabled: input.beatsEnabled,
    characterId: input.characterId,
    chronicleId,
    locationId,
    playerId: input.playerId,
    seedText: input.seedText,
    status: input.status,
    title: input.title,
  });
  logTiming('ensureChronicle completed');

  log('info', `Chronicle ${chronicle.id} created for player ${chronicle.playerId}`, { elapsedMs: Date.now() - startTime });
  return { chronicle };
}

async function requireCharacter(ctx: Context, characterId: string): Promise<Character> {
  const character = await ctx.chronicleStore.getCharacter(characterId);
  if (character === null || character === undefined) {
    throw new Error('Character not found for chronicle creation.');
  }
  return character;
}

function ensureCharacterOwnership(character: Character, playerId: string): void {
  if (character.playerId !== playerId) {
    throw new Error('Character does not belong to the requesting player.');
  }
}

function resolveLocationName(input: CreateChronicleInput): string {
  if (isNonEmptyString(input.location?.locale)) {
    return input.location.locale.trim();
  }
  if (isNonEmptyString(input.title)) {
    return `${input.title} Locale`.slice(0, 80);
  }
  return 'Uncatalogued Locale';
}

async function augmentChronicleSnapshot(
  ctx: Context,
  chronicleId: string
): Promise<ChronicleState | null> {
  const snapshot = await ctx.chronicleStore.getChronicleState(chronicleId);
  return snapshot;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export type AppRouter = typeof appRouter;
