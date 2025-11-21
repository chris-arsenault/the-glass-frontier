import type { Character, Chronicle, LocationPlan, LocationPlanOp, LocationSummary } from '@glass-frontier/dto';
import { isNonEmptyString, log } from '@glass-frontier/utils';
import type { LocationGraphStore, WorldStateStore } from '@glass-frontier/worldstate';

import type { GraphContext } from '../types';
import { createUpdatedBeats } from './beatUpdater';
import { createUpdatedCharacter } from './characterUpdater';
import { createUpdatedInventory } from './inventoryUpdater';
import { createLocationPlan } from './locationUpdater';


export class WorldUpdater {
  readonly #worldStateStore: WorldStateStore;
  readonly #locationGraphStore: LocationGraphStore;

  constructor(options: { worldStateStore: WorldStateStore; locationGraphStore: LocationGraphStore }) {
    this.#worldStateStore = options.worldStateStore;
    this.#locationGraphStore = options.locationGraphStore;
  }

  async update(context: GraphContext): Promise<GraphContext> {
    if (context.failure) {
      return context;
    }

    let nextContext = context;
    nextContext = this.#updateCharacter(nextContext);
    nextContext = this.#updateInventory(nextContext);
    nextContext = this.#updateBeats(nextContext);
    const locationPlan = await createLocationPlan(nextContext);
    nextContext = (await this.#saveLocation(nextContext, locationPlan)) ?? nextContext;

    await this.#saveCharacter(nextContext.chronicleState.character);
    await this.#saveChronicle(nextContext.chronicleState.chronicle);

    return nextContext;
  }

  #updateCharacter(context: GraphContext): GraphContext {
    log('info', 'Updating Character');

    const updatedCharacter = createUpdatedCharacter(context);
    return {
      ...context,
      chronicleState: {
        ...context.chronicleState,
        character: updatedCharacter
      }
    };
  }

  #updateInventory(context: GraphContext): GraphContext {
    log('info', 'Updating Inventory');
    if (context.inventoryDelta === undefined || context.inventoryDelta === null) {
      return context;
    }
    if (context.inventoryDelta.ops.length === 0) {
      return context;
    }

    const newInventory = createUpdatedInventory(context);
    return {
      ...context,
      chronicleState: {
        ...context.chronicleState,
        character: {
          ...context.chronicleState.character,
          inventory: newInventory,
        },
      }
    };
  }

  #updateBeats(context: GraphContext): GraphContext {
    log('info', 'Updating Beats');
    const newBeats = createUpdatedBeats(context);

    return {
      ...context,
      chronicleState: {
        ...context.chronicleState,
        chronicle: {
          ...context.chronicleState.chronicle,
          beats: newBeats
        }
      }
    };
  }

  async #saveCharacter(character: Character): Promise<void> {
    try {
      await this.#worldStateStore.upsertCharacter(character);
    } catch (error) {
      log('error', `Error in saving character ${error}`);
    }
  }

  async #saveChronicle(chronicle: Chronicle): Promise<void> {
    try {
      await this.#worldStateStore.upsertChronicle(chronicle);
    } catch (error) {
      log('error', `Error in saving chronicle ${error}`);
    }
  }

  async #saveLocation(context: GraphContext, plan: LocationPlan): Promise<GraphContext | undefined> {
    const anchorPlaceId =
      context.chronicleState.location?.anchorPlaceId ?? context.chronicleState.chronicle.locationId;
    if (!isNonEmptyString(anchorPlaceId)) {
      return context;
    }

    try {
      const parentId = context.chronicleState.location?.breadcrumb.at(-2)?.id ?? null;
      const nextAnchor = await this.#applyPlanWithNewApi(plan, anchorPlaceId, parentId);
      const summary = await this.#buildLocationSummary(nextAnchor);
      const updatedChronicle: Chronicle = {
        ...context.chronicleState.chronicle,
        locationId: nextAnchor,
      };

      return {
        ...context,
        chronicleState: {
          ...context.chronicleState,
          chronicle: updatedChronicle,
          location: summary ?? context.chronicleState.location,
        },
      };
    } catch (error) {
      log('error', 'Error in saving location', error);
      return context;
    }
  }

  async #applyPlanWithNewApi(
    plan: LocationPlan,
    anchorPlaceId: string,
    parentPlaceId: string | null
  ): Promise<string> {
    if (plan.ops.length === 0) {
      return anchorPlaceId;
    }
    const idMap = new Map<string, string>();
    await this.#createPlannedPlaces(plan.ops, idMap, parentPlaceId);
    return this.#applyEdgesAndMoves(plan.ops, idMap, anchorPlaceId, parentPlaceId);
  }

  #resolvePlaceId(placeId: string, idMap: Map<string, string>): string | undefined {
    return idMap.get(placeId) ?? placeId;
  }

  #resolvePlannedParentId(
    tempId: string,
    ops: LocationPlan['ops'],
    idMap: Map<string, string>,
    fallbackParentId: string | null
  ): string | null {
    const edgeOp = ops.find(
      (candidate): candidate is Extract<LocationPlanOp, { op: 'CREATE_EDGE' }> =>
        candidate.op === 'CREATE_EDGE' &&
        candidate.edge.dst === tempId &&
        candidate.edge.kind === 'CONTAINS'
    );
    if (edgeOp === undefined) {
      return fallbackParentId;
    }
    const resolvedSrc = this.#resolvePlaceId(edgeOp.edge.src, idMap);
    return resolvedSrc ?? fallbackParentId;
  }

  async #createPlannedPlaces(
    ops: LocationPlan['ops'],
    idMap: Map<string, string>,
    parentPlaceId: string | null
  ): Promise<void> {
    for (const op of ops) {
      if (op.op !== 'CREATE_PLACE') {
        continue;
      }
      const parentId = this.#resolvePlannedParentId(op.place.temp_id, ops, idMap, parentPlaceId);
      // eslint-disable-next-line no-await-in-loop
      const place = await this.#locationGraphStore.upsertLocation({
        description: op.place.description ?? null,
        kind: op.place.kind,
        name: op.place.name,
        parentId: parentId ?? null,
        tags: op.place.tags,
      });
      idMap.set(op.place.temp_id, place.id);
    }
  }

  async #applyEdgesAndMoves(
    ops: LocationPlan['ops'],
    idMap: Map<string, string>,
    anchorPlaceId: string,
    parentPlaceId: string | null
  ): Promise<string> {
    let nextAnchorId = anchorPlaceId;
    for (const op of ops) {
      switch (op.op) {
      case 'CREATE_EDGE': {
        const srcId = this.#resolvePlaceId(op.edge.src, idMap);
        const dstId = this.#resolvePlaceId(op.edge.dst, idMap);
        if (!isNonEmptyString(srcId) || !isNonEmptyString(dstId)) {
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        await this.#locationGraphStore.upsertEdge({
          dst: dstId,
          kind: op.edge.kind,
          src: srcId,
        });
        break;
      }
      case 'MOVE':
      case 'ENTER': {
        const resolvedAnchor = this.#resolvePlaceId(op.dst_place_id, idMap);
        if (isNonEmptyString(resolvedAnchor)) {
          nextAnchorId = resolvedAnchor;
        }
        break;
      }
      case 'EXIT': {
        if (isNonEmptyString(parentPlaceId)) {
          nextAnchorId = parentPlaceId;
        }
        break;
      }
      default:
        break;
      }
    }
    return nextAnchorId;
  }

  async #buildLocationSummary(anchorPlaceId: string): Promise<LocationSummary | null> {
    try {
      const details = await this.#locationGraphStore.getLocationDetails({ id: anchorPlaceId });
      return mapLocationDetailsToSummary(details);
    } catch (error) {
      log('error', 'Failed to map location summary', error);
      return null;
    }
  }
}

export const mapLocationDetailsToSummary = (details: {
  place: { id: string; kind: string; name: string; description?: string; tags?: string[] };
  breadcrumb: Array<{ id: string; kind: string; name: string }>;
}): LocationSummary => {
  const breadcrumb =
    Array.isArray(details.breadcrumb) && details.breadcrumb.length > 0
      ? details.breadcrumb
      : [{ id: details.place.id, kind: details.place.kind, name: details.place.name }];
  return {
    anchorPlaceId: details.place.id,
    breadcrumb,
    certainty: 'exact',
    description: details.place.description,
    status: [],
    tags: details.place.tags ?? [],
  };
};
