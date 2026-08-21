import { z } from 'zod';

import {
  HardStateKind,
  HardStateProminence,
  HardStateStatus,
  HardStateSubkind,
  RelationshipType,
} from './HardState';

/**
 * Where a piece of canon came from. The only correction path for machine-written
 * canon is reverting its batch, so this is what makes a batch identifiable.
 */
export const CanonSource = z.enum(['import', 'seed', 'play', 'author']);
export type CanonSource = z.infer<typeof CanonSource>;

/**
 * A reference to an entity within a proposal. Either an entity that already
 * exists (`id` or `externalKey`), or one declared elsewhere in the same batch
 * (`ref`). Within-batch references are what let a proposal describe a set of
 * new entities that point at each other.
 */
export const EntityRef = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({ externalKey: z.string().min(1) }),
  z.object({ ref: z.string().min(1) }),
]);
export type EntityRef = z.infer<typeof EntityRef>;

export const ProposedEntity = z.object({
  description: z.string().max(2000).optional(),
  /** Stable identity from the source world; makes re-ingest an update. */
  externalKey: z.string().min(1).optional(),
  /** Explicit id, for a seed that pins its own identifiers. */
  id: z.string().uuid().optional(),
  kind: HardStateKind,
  name: z.string().min(1),
  prominence: HardStateProminence.optional(),
  /** Name for this entity within the batch, so relationships can point at it. */
  ref: z.string().min(1).optional(),
  status: HardStateStatus.optional(),
  subkind: HardStateSubkind.optional(),
});
export type ProposedEntity = z.infer<typeof ProposedEntity>;

export const ProposedRelationship = z.object({
  dst: EntityRef,
  relationship: RelationshipType,
  src: EntityRef,
  strength: z.number().min(0).max(1).optional(),
});
export type ProposedRelationship = z.infer<typeof ProposedRelationship>;

export const ProposedLoreFragment = z.object({
  entity: EntityRef,
  externalKey: z.string().min(1).optional(),
  /** Explicit id, for a seed that pins its own identifiers. */
  id: z.string().uuid().optional(),
  prose: z.string().min(1),
  tags: z.array(z.string()).optional(),
  title: z.string().min(1),
});
export type ProposedLoreFragment = z.infer<typeof ProposedLoreFragment>;

export const CanonProposal = z.object({
  entities: z.array(ProposedEntity).default([]),
  lore: z.array(ProposedLoreFragment).default([]),
  relationships: z.array(ProposedRelationship).default([]),
  source: CanonSource,
  /** Identifies the run that produced this batch: a seed file, a chronicle id. */
  sourceId: z.string().min(1).optional(),
});
export type CanonProposal = z.infer<typeof CanonProposal>;

/**
 * A single reason a proposal was rejected. Validation reports every failure
 * rather than throwing on the first, so a writer can correct the whole batch.
 */
export const ProposalViolation = z.object({
  /** Where in the proposal: `entities[3]`, `relationships[7]`. */
  at: z.string().min(1),
  code: z.enum([
    'unknown_kind',
    'unknown_subkind',
    'unknown_status',
    'unknown_prominence',
    'unknown_relationship',
    'banned_relationship',
    'relationship_not_allowed',
    'unresolved_reference',
    'duplicate_ref',
    'duplicate_external_key',
  ]),
  message: z.string().min(1),
});
export type ProposalViolation = z.infer<typeof ProposalViolation>;

export const CommitBatchResult = z.object({
  batchId: z.string().uuid(),
  entityCount: z.number().int().nonnegative(),
  /** Entity ids by their in-batch `ref`, for callers that need to follow up. */
  entityIdsByRef: z.record(z.string(), z.string()),
  loreCount: z.number().int().nonnegative(),
  relationshipCount: z.number().int().nonnegative(),
});
export type CommitBatchResult = z.infer<typeof CommitBatchResult>;
