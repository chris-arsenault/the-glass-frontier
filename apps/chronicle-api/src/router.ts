import type { LocationPlace } from '@glass-frontier/dto';
import {
  Character as CharacterSchema,
  TranscriptEntry,
  PendingEquip,
  type Character,
} from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import { initTRPC } from '@trpc/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { Context } from './context';

type EnsureChronicleResult = Awaited<
  ReturnType<Context['worldStateStore']['ensureChronicle']>
>;

const t = initTRPC.context<Context>().create();
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
    characterId: z.string().min(1),
    chronicleId: z.string().uuid().optional(),
    location: locationDetailsSchema.optional(),
    locationId: z.string().uuid().optional(),
    loginId: z.string().min(1),
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

export const appRouter = t.router({
  createCharacter: t.procedure.input(CharacterSchema).mutation(async ({ ctx, input }) => {
    log('info', `Creating Character ${input.name}`);
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

  listCharacters: t.procedure
    .input(z.object({ loginId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.worldStateStore.listCharactersByLogin(input.loginId)),

  listChronicles: t.procedure
    .input(z.object({ loginId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.worldStateStore.listChroniclesByLogin(input.loginId)),

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
        location: result.locationSummary,
        chronicleStatus: result.chronicleStatus,
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
      const updated = await ctx.worldStateStore.upsertChronicle({
        ...chronicle,
        targetEndTurn: normalizedTarget,
      });
      return { chronicle: updated };
    }),

});

async function createChronicleHandler(
  ctx: Context,
  input: CreateChronicleInput
): Promise<{ chronicle: EnsureChronicleResult }> {
  const character = await requireCharacter(ctx, input.characterId);
  ensureCharacterOwnership(character, input.loginId);

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
    characterId: input.characterId,
    chronicleId,
    locationId: locationRoot.locationId,
    loginId: input.loginId,
    seedText: input.seedText,
    status: input.status,
    title: input.title,
  });

  await maybeMoveCharacterToExistingPlace(ctx, input.characterId, existingPlace);
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
