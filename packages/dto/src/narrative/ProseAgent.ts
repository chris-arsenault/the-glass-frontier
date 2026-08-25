import { z } from 'zod';

/**
 * The prose agent's structured sidecar: which canon entities its narration
 * used, declared by the agent itself. Feeds entity usage and focus updates;
 * unused entities are simply absent.
 */
export const ProseAgentSidecarEntry = z.object({
  emergentTags: z.array(z.string()).default([]),
  entityId: z.string().min(1)
    .describe('The entity\'s slug exactly as the world index or tools named it.'),
  usage: z.enum(['mentioned', 'central']),
});
export type ProseAgentSidecarEntry = z.infer<typeof ProseAgentSidecarEntry>;

/** The finish-tool payload: the narration plus its entity sidecar. */
export const ProseAgentResult = z.object({
  entities: z.array(ProseAgentSidecarEntry),
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
  sidecar: z.array(ProseAgentSidecarEntry),
  stepCount: z.number().int().positive(),
  totalTokens: z.number().int().nonnegative(),
});
export type ProseAlternate = z.infer<typeof ProseAlternate>;
