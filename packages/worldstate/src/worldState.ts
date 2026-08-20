import type { Pool } from 'pg';

import { createChronicleStore } from './chronicleStore';
import { GraphOperations } from './graphOperations';
import { LocationHelpers } from './locationHelpers';
import { createPool } from './pg';
import type { WorldSchemaStore, ChronicleStore } from './types';
import { createWorldSchemaStore } from './worldSchemaStore';

/**
 * Unified interface for all world state operations.
 * Encapsulates multiple knowledge domain stores (chronicles, world entities, etc.)
 * and provides a single entry point for world state management.
 */
export class WorldState {
  readonly #graph: GraphOperations;
  readonly #chronicles: ChronicleStore;
  readonly #world: WorldSchemaStore;
  readonly #locations: LocationHelpers;

  private constructor(options: {
    graph: GraphOperations;
    chronicles: ChronicleStore;
    world: WorldSchemaStore;
    locations: LocationHelpers;
  }) {
    this.#graph = options.graph;
    this.#chronicles = options.chronicles;
    this.#world = options.world;
    this.#locations = options.locations;
  }

  /**
   * Access to low-level graph operations (nodes/edges).
   * Use sparingly - prefer domain-specific stores for business logic.
   */
  get graph(): GraphOperations {
    return this.#graph;
  }

  /**
   * Chronicle, character, and turn management operations.
   * Manages player game sessions and their state.
   */
  get chronicles(): ChronicleStore {
    return this.#chronicles;
  }

  /**
   * World schema operations for entities, relationships, lore, and schema.
   * This is the primary store for world structure and content.
   */
  get world(): WorldSchemaStore {
    return this.#world;
  }

  /**
   * Location-specific convenience helpers.
   * Thin wrapper around world store for common location patterns.
   */
  get locations(): LocationHelpers {
    return this.#locations;
  }

  /**
   * Create a new WorldState instance with all knowledge domain stores.
   * @param options - Configuration options
   */
  static create(options?: {
    connectionString?: string;
    pool?: Pool;
  }): WorldState {
    const pool = createPool({
      connectionString: options?.connectionString,
      pool: options?.pool,
    });

    const graph = new GraphOperations(pool);
    const world = createWorldSchemaStore({ graph, pool });
    const chronicles = createChronicleStore({ graph, pool, worldStore: world });
    const locations = new LocationHelpers(world);

    return new WorldState({ chronicles, graph, locations, world });
  }

  // Future knowledge domains can be added here:
  // get characters(): CharacterHelpers { ... }
  // get factions(): FactionHelpers { ... }
}
