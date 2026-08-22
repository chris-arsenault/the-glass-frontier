import { z } from 'zod';

import type { GraphContext } from '../../../types.js';
import type { GraphNodeDelta } from '../graphNode';
import { LlmClassifierNode } from './LlmClassiferNode';

const SummaryResponseSchema = z.object({
  sceneOutcome: z.enum(['continue', 'complete']).default('continue'),
  sceneOutcomeReason: z.string().min(1).nullable().default(null),
  shouldCloseChronicle: z.boolean(),
  summary: z.string().min(1),
});

type SummaryResponse = z.infer<typeof SummaryResponseSchema>;

class GmSummaryNode extends LlmClassifierNode<SummaryResponse> {
  readonly id = 'gm-summary';
  constructor() {
    super({
      applyResult: (context, result) => this.#applySummary(context, result),
      id: 'gm-summary',
      schema: SummaryResponseSchema,
      schemaName: 'gm_summary_response',
      shouldRun: (context) => { return this.#canSummarize(context); },
      telemetryTag: 'llm.gm-summary'
    });
  }

  #canSummarize(context: GraphContext): boolean {
    const hasMessage = context.gmResponse !== undefined;
    const hasIntent = context.playerIntent !== undefined;
    return hasMessage && hasIntent;
  }

  #applySummary(context: GraphContext, response: SummaryResponse): GraphNodeDelta {
    const sceneOutcome = context.effectiveScene === null ? 'continue' : response.sceneOutcome;
    return {
      gmSummary: response.summary,
      sceneOutcome,
      sceneOutcomeReason: sceneOutcome === 'complete' ? response.sceneOutcomeReason : null,
      shouldCloseChronicle: response.shouldCloseChronicle,
    };
  }
}

export { GmSummaryNode };
