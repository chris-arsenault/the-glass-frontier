import { z } from 'zod';

import type { GraphContext } from '../../../types.js';
import type { GraphNodeDelta } from '../graphNode';
import { LlmClassifierNode } from './LlmClassiferNode';

const SummaryResponseSchema = z.object({
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

  #applySummary(_context: GraphContext, response: SummaryResponse): GraphNodeDelta {
    return {
      gmSummary: response.summary,
      shouldCloseChronicle: response.shouldCloseChronicle,
    };
  }
}

export { GmSummaryNode };
