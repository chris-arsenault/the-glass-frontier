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
  LocationBreadcrumbEntry,
  LocationPlace,
} from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';

const t = initTRPC.context<Context>().create();
const templateIdSchema = z.enum(PromptTemplateIds as [PromptTemplateId, ...PromptTemplateId[]]);
const locationSegmentSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  tags: z.array(z.string()).default([]),
  description: z.string().optional(),
});

const locationDetailsSchema = z.object({
  locale: z.string().min(1),
  atmosphere: z.string().min(1),
});

const toneSchema = z.object({
  toneChips: z.array(z.string()).max(8).optional(),
  toneNotes: z.string().max(240).optional(),
});

export const appRouter = t.router({
  // POST /chronicles
  createChronicle: t.procedure
    .input(
      z
        .object({
          chronicleId: z.string().uuid().optional(),
          locationId: z.string().uuid().optional(),
          loginId: z.string().min(1),
          characterId: z.string().min(1),
          title: z.string().min(1),
          location: locationDetailsSchema.optional(),
          status: z.enum(['open', 'closed']).optional(),
          seedText: z.string().max(400).optional(),
        })
        .refine(
          (payload) => Boolean(payload.locationId) || Boolean(payload.location),
          {
            message: 'Provide locationId or location details.',
            path: ['locationId'],
          }
        )
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
      const existingPlace = input.locationId
        ? await ctx.locationGraphStore.getPlace(input.locationId)
        : null;
      if (input.locationId && !existingPlace && !input.location) {
        throw new Error('Selected location was not found.');
      }

      const localeName =
        input.location?.locale ?? existingPlace?.name ?? 'Uncatalogued Locale';
      const localeDescription =
        input.location?.atmosphere ??
        existingPlace?.description ??
        'Atmosphere undisclosed.';

      const locationRoot = await ctx.locationGraphStore.ensureLocation({
        locationId: existingPlace?.locationId ?? input.locationId,
        name: localeName,
        description: localeDescription,
        tags: deriveLocationTags(localeDescription),
        characterId: input.characterId,
        kind: existingPlace?.kind ?? 'locale',
      });

      const chronicle = await ctx.worldStateStore.ensureChronicle({
        chronicleId,
        loginId: input.loginId,
        locationId: locationRoot.locationId,
        characterId: input.characterId,
        title: input.title,
        status: input.status,
        seedText: input.seedText,
      });
      log('info', `Ensuring chronicle ${chronicle.id} for login ${chronicle.loginId}`);
      return { chronicle }; // responseMeta sets 201
    }),
  listLocations: t.procedure
    .input(
      z
        .object({
          search: z.string().min(1).max(64).optional(),
          limit: z.number().int().positive().max(100).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => ctx.locationGraphStore.listLocationRoots(input)),

  getLocationGraph: t.procedure
    .input(z.object({ locationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => ctx.locationGraphStore.getLocationGraph(input.locationId)),

  getLocationPlace: t.procedure
    .input(z.object({ placeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const place = await ctx.locationGraphStore.getPlace(input.placeId);
      if (!place) {
        throw new Error('Location not found.');
      }
      const breadcrumb = await buildLocationBreadcrumb(ctx.locationGraphStore, place);
      return { place, breadcrumb };
    }),

  createLocationPlace: t.procedure
    .input(
      z.object({
        parentId: z.string().uuid().optional(),
        name: z.string().min(1),
        kind: z.string().min(1),
        tags: z.array(z.string()).max(12).optional(),
        description: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const place = await ctx.locationGraphStore.createPlace({
        parentId: input.parentId,
        name: input.name,
        kind: input.kind,
        tags: normalizeTags(input.tags),
        description: input.description,
      });
      const breadcrumb = await buildLocationBreadcrumb(ctx.locationGraphStore, place);
      return { place, breadcrumb };
    }),

  createLocationChain: t.procedure
    .input(
      z.object({
        parentId: z.string().uuid().optional(),
        segments: z.array(locationSegmentSchema).min(1).max(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const segments = input.segments.map((segment) => ({
        ...segment,
        tags: normalizeTags(segment.tags),
      }));
      const result = await ctx.locationGraphStore.createLocationChain({
        parentId: input.parentId,
        segments,
      });
      const breadcrumb = await buildLocationBreadcrumb(ctx.locationGraphStore, result.anchor);
      return { anchor: result.anchor, created: result.created, breadcrumb };
    }),

  generateChronicleSeeds: t.procedure
    .input(
      z
        .object({
          loginId: z.string().min(1),
          locationId: z.string().uuid(),
          count: z.number().int().positive().max(5).optional(),
        })
        .merge(toneSchema)
    )
    .mutation(async ({ ctx, input }) =>
      ctx.seedService.generateSeeds({
        loginId: input.loginId,
        locationId: input.locationId,
        toneChips: input.toneChips,
        toneNotes: input.toneNotes,
        count: input.count,
        authorizationHeader: ctx.authorizationHeader,
      })
    ),

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

async function buildLocationBreadcrumb(
  store: Context['locationGraphStore'],
  place: LocationPlace
): Promise<LocationBreadcrumbEntry[]> {
  const path: LocationBreadcrumbEntry[] = [];
  let current: LocationPlace | null = place;
  let depth = 0;
  while (current && depth < 20) {
    path.unshift({
      id: current.id,
      name: current.name,
      kind: current.kind,
    });
    if (!current.canonicalParentId) {
      break;
    }
    current = current.canonicalParentId ? await store.getPlace(current.canonicalParentId) : null;
    depth += 1;
  }
  return path;
}

function normalizeTags(tags?: string[]): string[] {
  if (!tags) {
    return [];
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const value = tag.trim().toLowerCase();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
    if (result.length >= 12) {
      break;
    }
  }
  return result;
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
