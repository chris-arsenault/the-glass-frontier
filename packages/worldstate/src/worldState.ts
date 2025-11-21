import type { Pool } from 'pg';

import { GraphOperations } from './graphOperations';
import { createLocationStore } from './locationStore';
import { createPool } from './pg';
import type { LocationStore, WorldSchemaStore, WorldStateStore as ChronicleStore } from './types';
import { createWorldStateStore } from './worldStateStore';
import { createWorldSchemaStore } from './worldSchemaStore';

/**
 * Unified interface for all world state operations.
 * Encapsulates multiple knowledge domain stores (chronicles, locations, etc.)
 * and provides a single entry point for world state management.
 */
export class WorldState {
  readonly #graph: GraphOperations;
  readonly #chronicles: ChronicleStore;
  readonly #locations: LocationStore;
  readonly #world: WorldSchemaStore;

  private constructor(options: {
    graph: GraphOperations;
    chronicles: ChronicleStore;
    locations: LocationStore;
    world: WorldSchemaStore;
  }) {
    this.#graph = options.graph;
    this.#chronicles = options.chronicles;
    this.#locations = options.locations;
    this.#world = options.world;
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

    // Shared graph operations for all knowledge domains
    const graph = new GraphOperations(pool);

    // Create domain stores with shared graph operations
    const locations = createLocationStore({ pool, graph });
    const chronicles = createWorldStateStore({
      pool,
      graph,
      locationStore: locations,
    });
    const world = createWorldSchemaStore({ pool, graph });

    return new WorldState({
      graph,
      chronicles,
      locations,
      world,
    });
  }

  /**
   * Access to low-level graph operations (nodes/edges).
   * Use sparingly - prefer domain-specific stores for business logic.
   */
  get graph(): GraphOperations {
    return this.#graph;
  }

  /**
   * Chronicle and turn management operations.
   */
  get chronicles(): ChronicleStore {
    return this.#chronicles;
  }

  /**
   * Location graph operations.
   */
  get locations(): LocationStore {
    return this.#locations;
  }

  /**
   * World schema operations for hard state and lore fragments.
   */
  get world(): WorldSchemaStore {
    return this.#world;
  }

  // Future knowledge domains can be added here:
  // get characters(): CharacterStore { ... }
  // get factions(): FactionStore { ... }
  // get relationships(): RelationshipStore { ... }
}
