import type {
  LocationBreadcrumbEntry,
  LocationPlace } from '@glass-frontier/dto';
import {
  Character as CharacterSchema,
  TranscriptEntry,
  PromptTemplateIds,
  type PromptTemplateId,
  PendingEquip
} from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import { initTRPC } from '@trpc/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { Context } from './context';

const t = initTRPC.context<Context>().create();
const templateIdSchema = z.enum(PromptTemplateIds as [PromptTemplateId, ...PromptTemplateId[]]);
const locationSegmentSchema = z.object({
  description: z.string().optional(),
  kind: z.string().min(1),
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

const locationDetailsSchema = z.object({
  atmosphere: z.string().min(1),
  locale: z.string().min(1),
});

const toneSchema = z.object({
  toneChips: z.array(z.string()).max(8).optional(),
  toneNotes: z.string().max(240).optional(),
});

export const appRouter = t.router({
  createCharacter: t.procedure.input(CharacterSchema).mutation(async ({ ctx, input }) => {
    log('info', `Creating Character ${input.name}`);
    const character = await ctx.worldStateStore.upsertCharacter(input);
    return { character };
  }),
  // POST /chronicles
  createChronicle: t.procedure
    .input(
      z
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
        characterId: input.characterId,
        description: localeDescription,
        kind: existingPlace?.kind ?? 'locale',
        locationId: existingPlace?.locationId ?? input.locationId,
        name: localeName,
        tags: deriveLocationTags(localeDescription),
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

      if (existingPlace && input.characterId) {
        await ctx.locationGraphStore.applyPlan({
          characterId: input.characterId,
          locationId: existingPlace.locationId,
          plan: {
            character_id: input.characterId,
            ops: [{ dst_place_id: existingPlace.id, op: 'MOVE' }],
          },
        });
      }
      log('info', `Ensuring chronicle ${chronicle.id} for login ${chronicle.loginId}`);
      return { chronicle }; // responseMeta sets 201
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
      return { anchor: result.anchor, breadcrumb, created: result.created };
    }),

  createLocationPlace: t.procedure
    .input(
      z.object({
        description: z.string().max(500).optional(),
        kind: z.string().min(1),
        name: z.string().min(1),
        parentId: z.string().uuid().optional(),
        tags: z.array(z.string()).max(12).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const place = await ctx.locationGraphStore.createPlace({
        description: input.description,
        kind: input.kind,
        name: input.name,
        parentId: input.parentId,
        tags: normalizeTags(input.tags),
      });
      const breadcrumb = await buildLocationBreadcrumb(ctx.locationGraphStore, place);
      return { breadcrumb, place };
    }),

  deleteChronicle: t.procedure
    .input(
      z.object({
        chronicleId: z.string().uuid(),
        loginId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const chronicle = await ctx.worldStateStore.getChronicle(input.chronicleId);
      if (!chronicle) {
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
      return { breadcrumb, place };
    }),

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

  listCharacters: t.procedure
    .input(z.object({ loginId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.worldStateStore.listCharactersByLogin(input.loginId)),

  listChronicles: t.procedure
    .input(z.object({ loginId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.worldStateStore.listChroniclesByLogin(input.loginId)),

  listLocations: t.procedure
    .input(
      z
        .object({
          limit: z.number().int().positive().max(100).optional(),
          search: z.string().min(1).max(64).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => ctx.locationGraphStore.listLocationRoots(input)),

  listPromptTemplates: t.procedure
    .input(z.object({ loginId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.templateManager.listTemplates(input.loginId)),

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
        character: result.updatedCharacter,
        location: result.locationSummary,
        turn: result.turn,
      };
    }),

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

  savePromptTemplate: t.procedure
    .input(
      z.object({
        editable: z.string().min(1),
        label: z.string().max(64).optional(),
        loginId: z.string().min(1),
        templateId: templateIdSchema,
      })
    )
    .mutation(async ({ ctx, input }) =>
      ctx.templateManager.saveTemplate({
        editable: input.editable,
        label: input.label,
        loginId: input.loginId,
        templateId: input.templateId,
      })
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
        characterId,
        locationId,
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
      kind: current.kind,
      name: current.name,
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
