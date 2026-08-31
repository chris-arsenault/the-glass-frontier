import { z } from 'zod';

/**
 * The same declaration after provenance resolution: the slug is replaced by
 * the canonical entity id, and entries naming nothing served are gone. Feeds
 * entity usage and focus updates.
 */
export const ProseSidecarEntry = z.object({
  emergentTags: z.array(z.string()).default([]),
  entityId: z.string().min(1),
  entitySlug: z.string().min(1),
  usage: z.enum(['mentioned', 'central']),
});
export type ProseSidecarEntry = z.infer<typeof ProseSidecarEntry>;

/**
 * One agent-panel response persisted alongside the canonical narration during
 * the evaluation phase, so the client can page through all of a turn's
 * candidate narrations.
 */
export const ProseAlternate = z.object({
  /**
   * This response was written from an empty brief because its research threw.
   * Without it a discarded brief is indistinguishable from a scout that simply
   * chose not to search, and comparing retrieval against no retrieval silently
   * compares two turns that both had none.
   */
  briefFailed: z.boolean().default(false),
  /** Total USD cost of this panelist's whole loop for the turn. */
  costUsd: z.number().nonnegative(),
  modelId: z.string().min(1),
  prose: z.string().min(1),
  sidecar: z.array(ProseSidecarEntry),
  /** Zero is a real answer: research that threw on its first round did none. */
  stepCount: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});
export type ProseAlternate = z.infer<typeof ProseAlternate>;
