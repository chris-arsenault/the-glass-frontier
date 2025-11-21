import type { Character, Chronicle, LocationSummary } from '@glass-frontier/dto';
import { isNonEmptyString, log } from '@glass-frontier/utils';
import type { WorldStateStore } from '@glass-frontier/worldstate';

import type { GraphContext, LocationStore } from '../types';
import { createUpdatedBeats } from './beatUpdater';
import { createUpdatedCharacter } from './characterUpdater';
import { createUpdatedInventory } from './inventoryUpdater';
import { applyLocationUpdate } from './locationUpdater';


export class WorldUpdater {
  readonly #worldStateStore: WorldStateStore;
  readonly #locationGraphStore: LocationStore;

  constructor(options: { worldStateStore: WorldStateStore; locationGraphStore: LocationStore }) {
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
    nextContext = (await this.#updateLocation(nextContext)) ?? nextContext;

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

  async #updateLocation(context: GraphContext): Promise<GraphContext | undefined> {
    try {
      const locationState = await applyLocationUpdate(context);

      if (!locationState) {
        return context;
      }

      const summary = await this.#buildLocationSummary(locationState.locationId);
      const updatedChronicle: Chronicle = {
        ...context.chronicleState.chronicle,
        locationId: locationState.locationId,
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
      log('error', 'Error updating location', error);
      return context;
    }
  }

  async #buildLocationSummary(locationId: string): Promise<LocationSummary | null> {
    try {
      const details = await this.#locationGraphStore.getLocationDetails({ id: locationId });
      return mapLocationDetailsToSummary(details);
    } catch (error) {
      log('error', 'Failed to map location summary', error);
      return null;
    }
  }
}

export const mapLocationDetailsToSummary = (details: {
  place: {
    id: string;
    kind: string;
    name: string;
    slug?: string;
    subkind?: string;
    status?: string;
    prominence?: string;
    description?: string;
  };
}): LocationSummary => {
  return {
    id: details.place.id,
    slug: details.place.slug ?? details.place.id,
    name: details.place.name,
    kind: details.place.kind,
    subkind: details.place.subkind,
    prominence: (details.place.prominence as LocationSummary['prominence']) ?? 'recognized',
    status: details.place.status,
    description: details.place.description,
    tags: [],
  };
};
