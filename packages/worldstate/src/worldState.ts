import type { Pool } from 'pg';

import { createChronicleStore } from './chronicleStore';
import { LocationHelpers } from './locationHelpers';
import { createPool } from './pg';
import type { WorldSchemaStore, ChronicleStore } from './types';
import { createWorldSchemaStore } from './worldSchemaStore';

/**
 * Entry point for world state.
 *
 * `world` holds canon — written only by `commitBatch`, read by everything else.
 * `chronicles` holds session state, which play mutates freely and which never
 * reaches canon except through a committed batch.
 */
export class WorldState {
  readonly #chronicles: ChronicleStore;
  readonly #world: WorldSchemaStore;
  readonly #locations: LocationHelpers;

  private constructor(options: {
    chronicles: ChronicleStore;
    world: WorldSchemaStore;
    locations: LocationHelpers;
  }) {
    this.#chronicles = options.chronicles;
    this.#world = options.world;
    this.#locations = options.locations;
  }

  /** Chronicle, character, and turn state for a play session. */
  get chronicles(): ChronicleStore {
    return this.#chronicles;
  }

  /** Canon: entities, relationships, lore, and the world vocabulary. */
  get world(): WorldSchemaStore {
    return this.#world;
  }

  /** Location-shaped reads over canon, for the GM's spatial context. */
  get locations(): LocationHelpers {
    return this.#locations;
  }

  static create(options?: {
    connectionString?: string;
    pool?: Pool;
  }): WorldState {
    const pool = createPool({
      connectionString: options?.connectionString,
      pool: options?.pool,
    });

    const world = createWorldSchemaStore({ pool });
    const chronicles = createChronicleStore({ pool, worldStore: world });
    const locations = new LocationHelpers(world);

    return new WorldState({ chronicles, locations, world });
  }
}
