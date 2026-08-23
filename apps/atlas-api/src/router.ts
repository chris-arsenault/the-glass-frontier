import {
  HardStateKind,
  HardStateProminence,
  PlayableRole,
  type HardState,
} from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context';

const t = initTRPC.context<Context>().create();
const CHRONICLE_LOCATION_ROLE = 'chronicle_location' as const;
const ENTITY_NOT_FOUND = 'Entity not found';

const isUuid = (s: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const findEntity = async (ctx: Context, identifier: string): Promise<HardState | null> => {
  const entity = isUuid(identifier)
    ? await ctx.worldSchemaStore.getEntity({ id: identifier })
    : null;
  return entity ?? ctx.worldSchemaStore.getEntityBySlug({ slug: identifier });
};

const isChronicleLocation = (entity: HardState | null | undefined): entity is HardState =>
  entity !== null
  && entity !== undefined
  && !entity.dm
  && !entity.isArticle
  && entity.isLocation
  && entity.playableAs.includes(CHRONICLE_LOCATION_ROLE);

const findChronicleLocation = async (input: {
  anchor: HardState;
  ctx: Context;
  locationSlug?: string;
}): Promise<HardState> => {
  if (input.locationSlug !== undefined) {
    const location = await input.ctx.worldSchemaStore.getEntityBySlug({
      slug: input.locationSlug,
    });
    if (!isChronicleLocation(location)) {
      throw new Error('Location not found, or the entity is not a place');
    }
    return location;
  }

  const linked = await input.ctx.worldSchemaStore.listEntitiesByIds(
    input.anchor.links.map((link) => link.targetId)
  );
  const location = linked.find(isChronicleLocation);
  if (location === undefined) {
    throw new Error('No location neighbors found for anchor entity');
  }
  return location;
};

/**
 * The Atlas reads canon; it does not write it.
 *
 * Canon is written only by `commitBatch` — the seed importer today, the
 * close-time judge later. Correcting canon means reverting a batch and
 * ingesting a fixed one, not editing a row, so there is no mutation surface
 * here beyond starting a chronicle.
 */
export const appRouter = t.router({
  // POST /entities/batch
  batchGetEntities: t.procedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      log('info', 'atlas-api: batchGetEntities', { count: input.ids.length });
      const entities = await ctx.worldSchemaStore.listEntitiesByIds(input.ids);
      return entities.filter((entity) => !entity.dm && !entity.isArticle);
    }),

  // POST /chronicles
  createChronicle: t.procedure
    .input(
      z.object({
        anchorSlug: z.string().min(1),
        characterId: z.string().uuid().optional(),
        locationSlug: z.string().min(1).optional(),
        playerId: z.string().min(1),
        title: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.playerId !== ctx.identity.sub) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      log('info', 'atlas-api: createChronicle', { title: input.title });

      const anchor = await ctx.worldSchemaStore.getEntityBySlug({ slug: input.anchorSlug });
      if (anchor === null || anchor.dm || anchor.isArticle) {
        throw new Error('Anchor not found');
      }

      const location = await findChronicleLocation({
        anchor,
        ctx,
        locationSlug: input.locationSlug,
      });

      const focusChoices = await ctx.worldSchemaStore.listFocusChoices({ locationId: location.id });
      if (!focusChoices.some((entity) => entity.id === anchor.id)) {
        throw new Error('Anchor is not a focus choice for this location');
      }

      return ctx.chronicleStore.ensureChronicle({
        anchorEntityId: anchor.id,
        characterId: input.characterId,
        locationId: location.id,
        locationName: location.name,
        playerId: ctx.identity.sub,
        title: input.title,
      });
    }),

  // GET /entities/:identifier
  getEntity: t.procedure
    .input(z.object({ identifier: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      log('info', 'atlas-api: getEntity', { identifier: input.identifier });
      const { identifier } = input;

      const entity = await findEntity(ctx, identifier);
      if (entity === null) {
        throw new Error(ENTITY_NOT_FOUND);
      }
      if (entity.dm) {
        throw new Error(ENTITY_NOT_FOUND);
      }

      const fragments = await ctx.worldSchemaStore.listLoreFragmentsByEntity({
        entityId: entity.id,
        limit: 200,
      });
      return { entity, fragments };
    }),

  // GET /entities/:identifier/neighbors
  getEntityNeighbors: t.procedure
    .input(
      z.object({
        identifier: z.string().min(1),
        kind: HardStateKind.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      log('info', 'atlas-api: getEntityNeighbors', { identifier: input.identifier });
      const { identifier, kind } = input;

      const entity = await findEntity(ctx, identifier);
      if (entity === null) {
        throw new Error(ENTITY_NOT_FOUND);
      }
      if (!isChronicleLocation(entity)) {
        throw new Error('Chronicle location not found');
      }

      const neighbors = await ctx.worldSchemaStore.listFocusChoices({ locationId: entity.id });
      return {
        entity,
        neighbors:
          kind === undefined ? neighbors : neighbors.filter((entry) => entry.kind === kind),
      };
    }),

  // GET /entities
  listEntities: t.procedure
    .input(
      z.object({
        isLocation: z.boolean().optional(),
        kind: HardStateKind.optional(),
        limit: z.number().int().min(1).max(200).optional(),
        maxProminence: HardStateProminence.optional(),
        minProminence: HardStateProminence.optional(),
        playableAs: PlayableRole.optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      log('info', 'atlas-api: listEntities', { kind: input?.kind ?? '' });
      return ctx.worldSchemaStore.listEntities({
        dm: false,
        isArticle: false,
        isLocation: input?.isLocation,
        kind: input?.kind,
        limit: input?.limit ?? 200,
        maxProminence: input?.maxProminence,
        minProminence: input?.minProminence,
        playableAs: input?.playableAs,
      });
    }),
});

export type AppRouter = typeof appRouter;
