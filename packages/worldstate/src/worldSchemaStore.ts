import type {
  HardState,
  LoreFragment,
  WorldKind,
  WorldRelationshipRule,
  WorldRelationshipType,
  WorldSchema,
} from '@glass-frontier/dto';
import type { Pool } from 'pg';

import { GraphOperations } from './graphOperations';
import { createPool } from './pg';
import type { WorldNeighbor, WorldSchemaStore } from './types';
import type {
  EntityInput,
  EntityListInput,
  NeighborListInput,
  RelationshipInput,
} from './worldEntityPersistence';
import { WorldEntityPersistence } from './worldEntityPersistence';
import type { LoreCreateInput, LoreUpdateInput } from './worldLorePersistence';
import { WorldLorePersistence } from './worldLorePersistence';
import type { KindInput } from './worldSchemaConfiguration';
import { WorldSchemaConfiguration } from './worldSchemaConfiguration';

class PostgresWorldSchemaStore implements WorldSchemaStore {
  readonly #entities: WorldEntityPersistence;
  readonly #lore: WorldLorePersistence;
  readonly #schema: WorldSchemaConfiguration;

  constructor(options: { pool: Pool; graph?: GraphOperations }) {
    const graph = options.graph ?? new GraphOperations(options.pool);
    this.#entities = new WorldEntityPersistence(options.pool, graph);
    this.#lore = new WorldLorePersistence(options.pool, graph);
    this.#schema = new WorldSchemaConfiguration(options.pool);
  }

  async upsertEntity(input: EntityInput): Promise<HardState> {
    return this.#entities.upsertEntity(input);
  }

  async deleteEntity(input: { id: string }): Promise<void> {
    return this.#entities.deleteEntity(input);
  }

  async upsertRelationship(input: RelationshipInput): Promise<void> {
    return this.#entities.upsertRelationship(input);
  }

  async deleteRelationship(input: Omit<RelationshipInput, 'strength'>): Promise<void> {
    return this.#entities.deleteRelationship(input);
  }

  async getEntity(input: { id: string }): Promise<HardState | null> {
    return this.#entities.getEntity(input);
  }

  async listEntities(input?: EntityListInput): Promise<HardState[]> {
    return this.#entities.listEntities(input);
  }

  async getEntityBySlug(input: { slug: string }): Promise<HardState | null> {
    return this.#entities.getEntityBySlug(input);
  }

  async listNeighbors(input: NeighborListInput): Promise<WorldNeighbor[]> {
    return this.#entities.listNeighbors(input);
  }

  async createLoreFragment(input: LoreCreateInput): Promise<LoreFragment> {
    return this.#lore.create(input);
  }

  async getLoreFragment(input: { id: string }): Promise<LoreFragment | null> {
    return this.#lore.get(input);
  }

  async listLoreFragmentsByEntity(input: {
    entityId: string;
    limit?: number;
  }): Promise<LoreFragment[]> {
    return this.#lore.listByEntity(input);
  }

  async updateLoreFragment(input: LoreUpdateInput): Promise<LoreFragment> {
    return this.#lore.update(input);
  }

  async deleteLoreFragment(input: { id: string }): Promise<void> {
    return this.#lore.delete(input);
  }

  async getWorldSchema(): Promise<WorldSchema> {
    return this.#schema.getSchema();
  }

  async upsertKind(input: KindInput): Promise<WorldKind> {
    return this.#schema.upsertKind(input);
  }

  async addRelationshipType(input: {
    id: string;
    description?: string | null;
  }): Promise<WorldRelationshipType> {
    return this.#schema.addRelationshipType(input);
  }

  async upsertRelationshipRule(input: WorldRelationshipRule): Promise<void> {
    return this.#schema.upsertRelationshipRule(input);
  }

  async deleteRelationshipRule(input: WorldRelationshipRule): Promise<void> {
    return this.#schema.deleteRelationshipRule(input);
  }
}

export const createWorldSchemaStore = (options?: {
  pool?: Pool;
  connectionString?: string;
  graph?: GraphOperations;
}): WorldSchemaStore => {
  const pool = options?.pool ?? createPool({ connectionString: options?.connectionString });
  return new PostgresWorldSchemaStore({ graph: options?.graph, pool });
};
