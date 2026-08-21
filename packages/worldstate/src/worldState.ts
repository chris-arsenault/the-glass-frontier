import type { Pool } from 'pg';

import { createChronicleStore } from './chronicleStore';
import { createPool } from './pg';
import type { WorldSchemaStore, ChronicleStore } from './types';
import { createWorldSchemaStore } from './worldSchemaStore';

/**
 * Entry point for world state.
 *
 * `world` holds canon — written only by `commitBatch`, read by everything else.
 * `chronicles` holds session state, which play mutates freely. The two do not
 * reach into each other: a chronicle names the canon entity it is anchored to,
 * and nothing a player does during a turn touches the graph.
 */
export class WorldState {
  readonly #chronicles: ChronicleStore;
  readonly #world: WorldSchemaStore;

  private constructor(options: { chronicles: ChronicleStore; world: WorldSchemaStore }) {
    this.#chronicles = options.chronicles;
    this.#world = options.world;
  }

  /** Chronicle, character, and turn state for a play session. */
  get chronicles(): ChronicleStore {
    return this.#chronicles;
  }

  /** Canon: entities, relationships, lore, and the world vocabulary. */
  get world(): WorldSchemaStore {
    return this.#world;
  }

  static create(options?: {
    connectionString?: string;
    pool?: Pool;
  }): WorldState {
    const pool = createPool({
      connectionString: options?.connectionString,
      pool: options?.pool,
    });

    return new WorldState({
      chronicles: createChronicleStore({ pool }),
      world: createWorldSchemaStore({ pool }),
    });
  }
}
