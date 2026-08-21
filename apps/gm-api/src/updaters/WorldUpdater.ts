import { log } from '@glass-frontier/utils';

import type { GraphContext } from '../types';
import { createUpdatedBeats } from './beatUpdater';
import { createUpdatedCharacter } from './characterUpdater';
import { createUpdatedInventory } from './inventoryUpdater';
import { applyLocationUpdate } from './locationUpdater';

export class WorldUpdater {
  async update(context: GraphContext): Promise<GraphContext> {
    if (context.failure) {
      return context;
    }

    const characterContext = this.#updateCharacter(context);
    const inventoryContext = this.#updateInventory(characterContext);
    const beatContext = this.#updateBeats(inventoryContext);
    return this.#updateLocation(beatContext);
  }

  #updateCharacter(context: GraphContext): GraphContext {
    log('info', 'Updating character session state');
    return {
      ...context,
      chronicleState: {
        ...context.chronicleState,
        character: createUpdatedCharacter(context),
      },
    };
  }

  #updateInventory(context: GraphContext): GraphContext {
    log('info', 'Updating inventory session state');
    if (context.inventoryDelta === undefined || context.inventoryDelta.ops.length === 0) {
      return context;
    }

    return {
      ...context,
      chronicleState: {
        ...context.chronicleState,
        character: {
          ...context.chronicleState.character,
          inventory: createUpdatedInventory(context),
        },
      },
    };
  }

  #updateBeats(context: GraphContext): GraphContext {
    log('info', 'Updating chronicle beats');
    return {
      ...context,
      chronicleState: {
        ...context.chronicleState,
        chronicle: {
          ...context.chronicleState.chronicle,
          beats: createUpdatedBeats(context),
        },
      },
    };
  }

  async #updateLocation(context: GraphContext): Promise<GraphContext> {
    const update = await applyLocationUpdate(context);
    if (update === null) {
      return context;
    }
    return {
      ...context,
      chronicleState: {
        ...context.chronicleState,
        discoveredLocations: update.discoveredLocations,
        location: update.location,
      },
    };
  }
}
