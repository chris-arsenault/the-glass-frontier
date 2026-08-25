import { z } from 'zod';

/**
 * What the agent declares: which canon entities its narration used, named by
 * slug. Models cannot carry uuids reliably, so no tool surface asks for one.
 */
export const ProseAgentSidecarInput = z.object({
  emergentTags: z.array(z.string()).default([]),
  entitySlug: z.string().min(1)
    .describe('The entity\'s slug exactly as the world index or tools named it.'),
  usage: z.enum(['mentioned', 'central']),
});
export type ProseAgentSidecarInput = z.infer<typeof ProseAgentSidecarInput>;

/**
 * The same declaration after provenance resolution: the slug is replaced by
 * the canonical entity id, and entries naming nothing served are gone. Feeds
 * entity usage and focus updates.
 */
export const ProseSidecarEntry = z.object({
  emergentTags: z.array(z.string()).default([]),
  entityId: z.string().min(1),
  usage: z.enum(['mentioned', 'central']),
});
export type ProseSidecarEntry = z.infer<typeof ProseSidecarEntry>;

/** The finish-tool payload: the narration plus its entity sidecar. */
export const ProseAgentResult = z.object({
  entities: z.array(ProseAgentSidecarInput),
  prose: z.string().min(1),
});
export type ProseAgentResult = z.infer<typeof ProseAgentResult>;

/**
 * One agent-panel response persisted alongside the canonical narration during
 * the evaluation phase, so the client can page through all of a turn's
 * candidate narrations.
 */
export const ProseAlternate = z.object({
  /** Total USD cost of this panelist's whole loop for the turn. */
  costUsd: z.number().nonnegative(),
  modelId: z.string().min(1),
  prose: z.string().min(1),
  sidecar: z.array(ProseSidecarEntry),
  stepCount: z.number().int().positive(),
  totalTokens: z.number().int().nonnegative(),
});
export type ProseAlternate = z.infer<typeof ProseAlternate>;
