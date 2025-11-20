import type { LocationPlace, Player, PlayerPreferences } from '@glass-frontier/dto';
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
import { resetPlaywrightFixtures } from './playwright/resetFixtures';

type EnsureChronicleResult = Awaited<
  ReturnType<Context['worldStateStore']['ensureChronicle']>
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
    beatsEnabled: z.boolean().optional(),
    characterId: z.string().min(1),
    chronicleId: z.string().uuid().optional(),
    location: locationDetailsSchema.optional(),
    locationId: z.string().uuid().optional(),
    playerId: z.string().min(1),
    seedText: z.string().max(400).optional(),
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
    const character = await ctx.worldStateStore.upsertCharacter(input);
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
      const chronicle = await ctx.worldStateStore.getChronicle(input.chronicleId);
      if (chronicle === null || chronicle === undefined) {
        return { chronicleId: input.chronicleId, deleted: false };
      }
      if (chronicle.playerId !== input.playerId) {
        throw new Error('Chronicle does not belong to the requesting player.');
      }
      await ctx.worldStateStore.deleteChronicle(input.chronicleId);
      return { chronicleId: input.chronicleId, deleted: true };
    }),

  generateChronicleSeeds: t.procedure
    .input(
      z
        .object({
          count: z.number().int().positive().max(5).optional(),
          locationId: z.string().uuid(),
          playerId: z.string().min(1),
        })
        .merge(toneSchema)
    )
    .mutation(async ({ ctx, input }) =>
      ctx.seedService.generateSeeds({
        authorizationHeader: ctx.authorizationHeader,
        count: input.count,
        locationId: input.locationId,
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
    .query(async ({ ctx, input }) => ctx.worldStateStore.listCharactersByPlayer(input.playerId)),

  listChronicles: t.procedure
    .input(z.object({ playerId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.worldStateStore.listChroniclesByPlayer(input.playerId)),

  resetPlaywrightFixtures: t.procedure.mutation(async ({ ctx }) => {
    if (process.env.PLAYWRIGHT_RESET_ENABLED !== '1') {
      throw new Error('Playwright reset disabled');
    }
    await resetPlaywrightFixtures(ctx);
    return { ok: true };
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

});

async function createChronicleHandler(
  ctx: Context,
  input: CreateChronicleInput
): Promise<{ chronicle: EnsureChronicleResult }> {
  await ctx.playerStore.ensure(input.playerId);
  const character = await requireCharacter(ctx, input.characterId);
  ensureCharacterOwnership(character, input.playerId);

  const chronicleId = input.chronicleId ?? randomUUID();
  const existingPlace = await resolveExistingPlace(ctx, input.locationId);
  ensureLocationSelection(existingPlace, input);
  const localeDetails = resolveLocaleDetails(input, existingPlace);

  const locationRoot = await ctx.locationGraphStore.ensureLocation({
    characterId: input.characterId,
    description: localeDetails.description,
    kind: localeDetails.kind,
    locationId: existingPlace?.locationId ?? input.locationId,
    name: localeDetails.name,
    tags: deriveLocationTags(localeDetails.description),
  });

  const chronicle = await ctx.worldStateStore.ensureChronicle({
    beatsEnabled: input.beatsEnabled,
    characterId: input.characterId,
    chronicleId,
    locationId: locationRoot.locationId,
    playerId: input.playerId,
    seedText: input.seedText,
    status: input.status,
    title: input.title,
  });

  await maybeMoveCharacterToExistingPlace(ctx, input.characterId, existingPlace);
  log('info', `Ensuring chronicle ${chronicle.id} for player ${chronicle.playerId}`);
  return { chronicle };
}

async function requireCharacter(ctx: Context, characterId: string): Promise<Character> {
  const character = await ctx.worldStateStore.getCharacter(characterId);
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

async function resolveExistingPlace(
  ctx: Context,
  locationId?: string
): Promise<LocationPlace | null> {
  if (!isNonEmptyString(locationId)) {
    return null;
  }
  return ctx.locationGraphStore.getPlace(locationId);
}

function ensureLocationSelection(
  existingPlace: LocationPlace | null,
  input: CreateChronicleInput
): void {
  if (
    isNonEmptyString(input.locationId) &&
    existingPlace === null &&
    input.location === undefined
  ) {
    throw new Error('Selected location was not found.');
  }
}

function resolveLocaleDetails(
  input: CreateChronicleInput,
  existingPlace: LocationPlace | null
): { description: string; kind: string; name: string } {
  return {
    description: resolveLocaleDescription(input, existingPlace),
    kind: existingPlace?.kind ?? 'locale',
    name: resolveLocaleName(input, existingPlace),
  };
}

function resolveLocaleDescription(
  input: CreateChronicleInput,
  existingPlace: LocationPlace | null
): string {
  if (isNonEmptyString(input.location?.atmosphere)) {
    return input.location.atmosphere.trim();
  }
  if (isNonEmptyString(existingPlace?.description)) {
    return existingPlace.description;
  }
  return 'Atmosphere undisclosed.';
}

function resolveLocaleName(
  input: CreateChronicleInput,
  existingPlace: LocationPlace | null
): string {
  if (isNonEmptyString(input.location?.locale)) {
    return input.location.locale.trim();
  }
  if (isNonEmptyString(existingPlace?.name)) {
    return existingPlace.name;
  }
  return 'Uncatalogued Locale';
}

async function maybeMoveCharacterToExistingPlace(
  ctx: Context,
  characterId: string,
  place: LocationPlace | null
): Promise<void> {
  if (place === null) {
    return;
  }
  await ctx.locationGraphStore.applyPlan({
    characterId,
    locationId: place.locationId,
    plan: {
      character_id: characterId,
      ops: [{ dst_place_id: place.id, op: 'MOVE' }],
    },
  });
}

async function augmentChronicleSnapshot(
  ctx: Context,
  chronicleId: string
): Promise<ChronicleState | null> {
  const snapshot = await ctx.worldStateStore.getChronicleState(chronicleId);
  if (snapshot === null || snapshot === undefined) {
    return null;
  }
  const characterId = snapshot.chronicle.characterId ?? snapshot.character?.id ?? null;
  const locationId = snapshot.chronicle.locationId;
  if (isNonEmptyString(characterId) && isNonEmptyString(locationId)) {
    snapshot.location =
      (await ctx.locationGraphStore.summarizeCharacterLocation({
        characterId,
        locationId,
      })) ?? null;
  }
  return snapshot;
}

function deriveLocationTags(atmosphere: string): string[] {
  if (!isNonEmptyString(atmosphere)) {
    return [];
  }
  return atmosphere
    .split(/[,.]/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 1)
    .slice(0, 6);
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export type AppRouter = typeof appRouter;
