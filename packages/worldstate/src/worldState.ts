import type { Pool } from 'pg';

import { GraphOperations } from './graphOperations';
import { createPool } from './pg';
import type { WorldSchemaStore, WorldStateStore as ChronicleStore } from './types';
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
  readonly #world: WorldSchemaStore;

  private constructor(options: {
    graph: GraphOperations;
    chronicles: ChronicleStore;
    world: WorldSchemaStore;
  }) {
    this.#graph = options.graph;
    this.#chronicles = options.chronicles;
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

    const world = createWorldSchemaStore({ pool, graph });
    const chronicles = createWorldStateStore({
      pool,
      graph,
      worldStore: world,
    });

    return new WorldState({
      graph,
      chronicles,
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
