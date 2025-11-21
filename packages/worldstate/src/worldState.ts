import type { Pool } from 'pg';

import { GraphOperations } from './graphOperations';
import { createLocationStore } from './locationStore';
import { createPool } from './pg';
import type { LocationStore, WorldStateStore as ChronicleStore } from './types';
import { createWorldStateStore } from './worldStateStore';

/**
 * Unified interface for all world state operations.
 * Encapsulates multiple knowledge domain stores (chronicles, locations, etc.)
 * and provides a single entry point for world state management.
 */
export class WorldState {
  readonly #graph: GraphOperations;
  readonly #chronicles: ChronicleStore;
  readonly #locations: LocationStore;

  private constructor(options: {
    graph: GraphOperations;
    chronicles: ChronicleStore;
    locations: LocationStore;
  }) {
    this.#graph = options.graph;
    this.#chronicles = options.chronicles;
    this.#locations = options.locations;
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

    return new WorldState({
      graph,
      chronicles,
      locations,
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

  // Future knowledge domains can be added here:
  // get characters(): CharacterStore { ... }
  // get factions(): FactionStore { ... }
  // get relationships(): RelationshipStore { ... }
}
