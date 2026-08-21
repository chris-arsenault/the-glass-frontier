import { z } from 'zod';

import {
  RELATIONSHIP_TYPE_IDS,
  WORLD_KIND_IDS,
  WORLD_PROMINENCE_IDS,
  WORLD_SUBKIND_IDS,
} from './vocabulary';

/**
 * Every enumerated value set here is derived from the world vocabulary in
 * `vocabulary.ts`. Add a kind, subkind, or relationship verb there and it
 * becomes valid on the wire, in the database seed, and in the ingest validator
 * at once. Status is deliberately free text: the source schema declares no
 * status vocabulary, so the game does not invent one.
 */

export const HardStateKind = z.enum(WORLD_KIND_IDS);
export type HardStateKind = z.infer<typeof HardStateKind>;

export const HardStateSubkind = z.enum(WORLD_SUBKIND_IDS);
export type HardStateSubkind = z.infer<typeof HardStateSubkind>;

export const HardStateStatus = z.string().min(1);
export type HardStateStatus = z.infer<typeof HardStateStatus>;

export const HardStateProminence = z.enum(WORLD_PROMINENCE_IDS);
export type HardStateProminence = z.infer<typeof HardStateProminence>;

export const RelationshipType = z.enum(RELATIONSHIP_TYPE_IDS);
export type RelationshipType = z.infer<typeof RelationshipType>;

/**
 * The small, repeated answers a reader expects at the top of an entry —
 * "Born", "Population", "Function". Keys and values come from the source
 * world's fact cards; the game stores them verbatim.
 */
export const HardStateFacts = z.record(z.string(), z.union([z.string(), z.number()]));
export type HardStateFacts = z.infer<typeof HardStateFacts>;

export const HardStateLink = z.object({
  direction: z.enum(['out', 'in']),
  relationship: RelationshipType,
  /** In-world year the relation began, when the source records one. */
  since: z.number().int().optional(),
  strength: z.number().min(0).max(1).optional(), // 0.0 (weak/spatial) to 1.0 (strong/narrative)
  targetId: z.string().min(1),
  /** In-world year the relation ended, when the source records one. */
  until: z.number().int().optional(),
});
export type HardStateLink = z.infer<typeof HardStateLink>;

export const HardState = z.object({
  createdAt: z
    .number()
    .int()
    .nonnegative()
    .default(() => Date.now()),
  description: z.string().max(2000).optional(),
  facts: HardStateFacts.default({}),
  id: z.string().min(1),
  kind: HardStateKind,
  links: z.array(HardStateLink).default([]),
  name: z.string().min(1),
  prominence: HardStateProminence.default('recognized'),
  slug: z.string().min(1),
  status: HardStateStatus.optional(),
  subkind: HardStateSubkind.optional(),
  updatedAt: z
    .number()
    .int()
    .nonnegative()
    .default(() => Date.now()),
});

export type HardState = z.infer<typeof HardState>;
