import type { Player, PlayerPreferences } from '@glass-frontier/dto';
import {
  PendingEquip,
  BugReportSubmissionSchema,
  BUG_REPORT_STATUSES,
  PlayerPreferencesSchema,
  type TokenUsagePeriod,
} from '@glass-frontier/dto';
import {
  CharacterDraftSchema,
  ChronicleStatusSchema,
  PageOptionsSchema,
  TranscriptEntry,
  TranscriptEntrySchema,
  type Character,
  type Chronicle,
  type LocationSummary,
} from '@glass-frontier/worldstate';
import { log } from '@glass-frontier/utils';
import { initTRPC } from '@trpc/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { Context } from './context';
import { resetPlaywrightFixtures } from './playwright/resetFixtures';

const t = initTRPC.context<Context>().create();
const normalizePlayerPreferences = (prefs?: PlayerPreferences | null): PlayerPreferences => ({
  feedbackVisibility: prefs?.feedbackVisibility ?? 'all',
});
const toneSchema = z.object({
  toneChips: z.array(z.string()).max(8).optional(),
  toneNotes: z.string().max(240).optional(),
});

const createChronicleInputSchema = z.object({
  beatsEnabled: z.boolean().optional(),
  characterId: z.string().min(1),
  chronicleId: z.string().uuid().optional(),
  locationId: z.string().uuid(),
  loginId: z.string().min(1),
  seedText: z.string().max(400).optional(),
  status: ChronicleStatusSchema.optional(),
  tags: z.array(z.string().min(1)).max(8).optional(),
  title: z.string().min(1),
});

type CreateChronicleInput = z.infer<typeof createChronicleInputSchema>;

const ensurePlayerRecord = async (ctx: Context, loginId: string): Promise<Player> => {
  const existing = await ctx.playerStore.getPlayer(loginId);
  if (existing !== null && existing !== undefined) {
    if (existing.templateOverrides === undefined) {
      existing.templateOverrides = {};
    }
    return existing;
  }
  const blank: Player = {
    loginId,
    templateOverrides: {},
  };
  return ctx.playerStore.upsertPlayer(blank);
};

export const appRouter = t.router({
  createCharacter: t.procedure.input(CharacterDraftSchema).mutation(async ({ ctx, input }) => {
    log('info', `Creating Character ${input.name}`);
    const character = await ctx.worldStateStore.createCharacter(input);
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
        loginId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const chronicle = await ctx.worldStateStore.getChronicle(input.chronicleId);
      if (chronicle === null || chronicle === undefined) {
        return { chronicleId: input.chronicleId, deleted: false };
      }
      if (chronicle.loginId !== input.loginId) {
        throw new Error('Chronicle does not belong to the requesting login.');
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
          loginId: z.string().min(1),
        })
        .merge(toneSchema)
    )
    .mutation(async ({ ctx, input }) =>
      ctx.seedService.generateSeeds({
        authorizationHeader: ctx.authorizationHeader,
        count: input.count,
        locationId: input.locationId,
        loginId: input.loginId,
        toneChips: input.toneChips,
        toneNotes: input.toneNotes,
      })
    ),

  // GET /chronicles/:chronicleId
  getChronicle: t.procedure
    .input(z.object({ chronicleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => augmentChronicleSnapshot(ctx, input.chronicleId)),

  getPlayerSettings: t.procedure
    .input(z.object({ loginId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const player = await ensurePlayerRecord(ctx, input.loginId);
      return { preferences: normalizePlayerPreferences(player.preferences) };
    }),

  getTokenUsageSummary: t.procedure
    .input(
      z.object({
        limit: z.number().int().positive().max(12).optional(),
        loginId: z.string().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.tokenUsageStore === null) {
        return { usage: [] as TokenUsagePeriod[] };
      }
      const limit = Math.min(input.limit ?? 6, 12);
      const usage = await ctx.tokenUsageStore.listUsage(input.loginId, limit);
      return { usage };
    }),

  listBugReports: t.procedure.query(async ({ ctx }) => {
    const reports = await ctx.bugReportStore.listReports();
    return { reports };
  }),

  listCharacters: t.procedure
    .input(
      z.object({
        loginId: z.string().min(1),
        page: PageOptionsSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => ctx.worldStateStore.listCharacters(input.loginId, input.page)),

  listChronicles: t.procedure
    .input(
      z.object({
        loginId: z.string().min(1),
        page: PageOptionsSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => ctx.worldStateStore.listChronicles(input.loginId, input.page)),

  // POST /chronicles/:chronicleId/messages
  postMessage: t.procedure
    .input(
      z.object({
        chronicleId: z.string().uuid(),
        content: TranscriptEntrySchema,
        pendingEquip: z.array(PendingEquip).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const chronicle = await ctx.worldStateStore.getChronicle(input.chronicleId);
      if (chronicle?.status === 'closed') {
        throw new Error('Chronicle is closed.');
      }
      const playerEntry = { ...input.content, role: 'player' as const };
      const result = await ctx.engine.handlePlayerMessage(input.chronicleId, playerEntry, {
        authorizationHeader: ctx.authorizationHeader,
        pendingEquip: input.pendingEquip ?? [],
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
      const updated = await ctx.worldStateStore.updateChronicle({
        ...chronicle,
        targetEndTurn: normalizedTarget,
      });
      return { chronicle: updated };
    }),
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
        loginId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.bugReportStore.createReport({
        characterId: input.characterId ?? null,
        chronicleId: input.chronicleId ?? null,
        details: input.details,
        loginId: input.loginId,
        playerId: input.playerId ?? null,
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
        loginId: z.string().min(1),
        preferences: PlayerPreferencesSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const player = await ensurePlayerRecord(ctx, input.loginId);
      const preferences = normalizePlayerPreferences(input.preferences);
      const updated: Player = {
        ...player,
        preferences,
      };
      await ctx.playerStore.upsertPlayer(updated);
      return { preferences };
    }),

});

async function createChronicleHandler(
  ctx: Context,
  input: CreateChronicleInput
): Promise<{ chronicle: Chronicle }> {
  const character = await requireCharacter(ctx, input.characterId);
  ensureCharacterOwnership(character, input.loginId);
  const chronicleId = input.chronicleId ?? randomUUID();
  const location = await requireLocationSummary(ctx, input.locationId, {
    loginId: input.loginId,
    chronicleId,
  });
  const chronicle = await ensureChronicleRecord(ctx, {
    beatsEnabled: input.beatsEnabled ?? true,
    characterId: input.characterId,
    chronicleId,
    locationId: location.id,
    loginId: input.loginId,
    seedText: input.seedText,
    status: input.status ?? 'active',
    tags: input.tags ?? location.tags ?? [],
    title: input.title,
  });
  log('info', `Ensuring chronicle ${chronicle.id} for login ${chronicle.loginId}`);
  return { chronicle };
}

async function requireCharacter(ctx: Context, characterId: string): Promise<Character> {
  const character = await ctx.worldStateStore.getCharacter(characterId);
  if (character === null || character === undefined) {
    throw new Error('Character not found for chronicle creation.');
  }
  return character;
}

function ensureCharacterOwnership(character: Character, loginId: string): void {
  if (character.loginId !== loginId) {
    throw new Error('Character does not belong to the requesting login.');
  }
}

async function requireLocationSummary(
  ctx: Context,
  locationId: string,
  options: { loginId: string; chronicleId: string }
): Promise<LocationSummary> {
  const location = await ctx.worldStateStore.getLocation(locationId);
  if (location === null) {
    throw new Error('Selected location was not found.');
  }
  if (location.loginId !== options.loginId) {
    throw new Error('Location does not belong to the requesting login.');
  }
  if (
    isNonEmptyString(location.chronicleId) &&
    location.chronicleId !== options.chronicleId
  ) {
    throw new Error('Location is already bound to another chronicle.');
  }
  return location;
}

async function ensureChronicleRecord(
  ctx: Context,
  input: {
    chronicleId: string;
    loginId: string;
    characterId: string;
    title: string;
    status: Chronicle['status'];
    locationId?: string;
    beatsEnabled?: boolean;
    seedText?: string;
    tags?: string[];
  }
): Promise<Chronicle> {
  const existing = await ctx.worldStateStore.getChronicle(input.chronicleId);
  if (existing) {
    return existing;
  }
  return ctx.worldStateStore.createChronicle({
    id: input.chronicleId,
    loginId: input.loginId,
    characterId: input.characterId,
    title: input.title,
    status: input.status,
    locationId: input.locationId,
    beatsEnabled: input.beatsEnabled ?? true,
    seedText: input.seedText,
    tags: input.tags ?? [],
  });
}

async function augmentChronicleSnapshot(
  ctx: Context,
  chronicleId: string
): Promise<ChronicleState | null> {
  const snapshot = await ctx.worldStateStore.getChronicleSnapshot(chronicleId);
  if (snapshot === null || snapshot === undefined) {
    return null;
  }
  if (snapshot.chronicle === null) {
    throw new Error('Chronicle not found.');
  }
  const locationId = snapshot.chronicle.locationId;
  let location: LocationSummary | null = null;
  if (isNonEmptyString(locationId)) {
    location = (await ctx.worldStateStore.getLocation(locationId)) ?? null;
  }
  const latestTurn = snapshot.turns.at(-1);
  return {
    chronicleId,
    character: snapshot.character ?? null,
    chronicle: snapshot.chronicle,
    location,
    turnSequence: latestTurn?.turnSequence ?? 0,
    turns: snapshot.turns,
  };
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export type AppRouter = typeof appRouter;
