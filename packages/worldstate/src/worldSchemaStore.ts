import type {
  CanonProposal,
  CommitBatchResult,
  ContextSliceEntity,
  ContextSliceInput,
  HardState,
  LoreFragment,
  WorldSchema,
} from '@glass-frontier/dto';
import type { Pool } from 'pg';

import { CanonWriter } from './canonWriter';
import { ContextSliceReader } from './contextSlice';
import {
  type EntityEmbeddingSource,
  EntityEmbeddingReader,
  type SubjectEntityCandidate,
} from './entityEmbeddings';
import type { EntityListInput, EntityStats, NeighborListInput } from './entityReader';
import { EntityReader } from './entityReader';
import { LoreReader } from './loreReader';
import { createPool } from './pg';
import type { WorldNeighbor, WorldSchemaStore } from './types';
import { WorldSchemaConfiguration } from './worldSchemaConfiguration';

/**
 * Canon storage: batch in, slice out.
 *
 * `commitBatch` is the only writer. Everything else reads. There is no
 * per-entity mutation, so a caller cannot express a partial update whose
 * missing fields have to be guessed at.
 */
class PostgresWorldSchemaStore implements WorldSchemaStore {
  readonly #context: ContextSliceReader;
  readonly #embeddings: EntityEmbeddingReader;
  readonly #entities: EntityReader;
  readonly #lore: LoreReader;
  readonly #schema: WorldSchemaConfiguration;
  readonly #writer: CanonWriter;

  constructor(options: { pool: Pool }) {
    this.#context = new ContextSliceReader(options.pool);
    this.#embeddings = new EntityEmbeddingReader(options.pool);
    this.#entities = new EntityReader(options.pool);
    this.#lore = new LoreReader(options.pool);
    this.#schema = new WorldSchemaConfiguration(options.pool);
    this.#writer = new CanonWriter(options.pool);
  }

  async commitBatch(proposal: CanonProposal): Promise<CommitBatchResult> {
    return this.#writer.commitBatch(proposal);
  }

  async getContextSlice(input: ContextSliceInput): Promise<ContextSliceEntity[]> {
    return this.#context.getContextSlice(input);
  }

  async hasEntityEmbeddings(kind: HardState['kind']): Promise<boolean> {
    return this.#embeddings.hasEmbeddings(kind);
  }

  async listMissingEntityEmbeddings(limit?: number): Promise<EntityEmbeddingSource[]> {
    return this.#embeddings.listMissing(limit);
  }

  async saveEntityEmbedding(id: string, embedding: number[]): Promise<void> {
    return this.#embeddings.save(id, embedding);
  }

  async findSubjectCandidates(input: {
    embedding: number[];
    focusIds: string[];
    kind: HardState['kind'];
    limit?: number;
  }): Promise<SubjectEntityCandidate[]> {
    return this.#embeddings.findSubjectCandidates(input);
  }

  async revertBatch(batchId: string): Promise<void> {
    return this.#writer.revertBatch(batchId);
  }

  async findBatch(input: {
    source: CanonProposal['source'];
    sourceId: string;
  }): Promise<{ batchId: string } | null> {
    return this.#writer.findBatch(input);
  }

  async getEntity(input: { id: string }): Promise<HardState | null> {
    return this.#entities.getEntity(input);
  }

  async getEntityBySlug(input: { slug: string }): Promise<HardState | null> {
    return this.#entities.getEntityBySlug(input);
  }

  async findLocationByName(input: { name: string }): Promise<HardState | null> {
    return this.#entities.findLocationByName(input);
  }

  async findEntitiesByName(input: { name: string }): Promise<HardState[]> {
    return this.#entities.findEntitiesByName(input);
  }

  async listEntityStats(ids: string[]): Promise<EntityStats[]> {
    return this.#entities.listEntityStats(ids);
  }

  async listEntities(input?: EntityListInput): Promise<HardState[]> {
    return this.#entities.listEntities(input);
  }

  async listEntitiesByIds(ids: string[]): Promise<HardState[]> {
    return this.#entities.listEntitiesByIds(ids);
  }

  async listFocusChoices(input: { locationId: string }): Promise<HardState[]> {
    return this.#entities.listFocusChoices(input);
  }

  async listNeighbors(input: NeighborListInput): Promise<WorldNeighbor[]> {
    return this.#entities.listNeighbors(input);
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

  async listLoreFragmentsByEntities(input: {
    entityIds: string[];
    perEntityLimit?: number;
  }): Promise<Map<string, LoreFragment[]>> {
    return this.#lore.listByEntities(input);
  }

  async getWorldSchema(): Promise<WorldSchema> {
    return this.#schema.getSchema();
  }
}

export const createWorldSchemaStore = (options?: {
  pool?: Pool;
  connectionString?: string;
}): WorldSchemaStore => {
  const pool = options?.pool ?? createPool({ connectionString: options?.connectionString });
  return new PostgresWorldSchemaStore({ pool });
};
