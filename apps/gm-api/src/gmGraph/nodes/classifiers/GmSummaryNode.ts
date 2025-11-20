import { z } from 'zod';

import type { GraphContext } from '../../../types.js';
import {LlmClassifierNode} from "./LlmClassiferNode";

const SummaryResponseSchema = z.object({
  shouldCloseChronicle: z.boolean(),
  summary: z.string().min(1),
});

type SummaryResponse = z.infer<typeof SummaryResponseSchema>;

class GmSummaryNode extends LlmClassifierNode<SummaryResponse> {
  readonly id = 'gm-summary';
  constructor() {
    super({
      id: 'gm-summary',
      schema: SummaryResponseSchema,
      schemaName: 'gm_summary_response',
      applyResult: (context, result) => this.#applySummary(context, result),
      shouldRun: (context) => { return this.#canSummarize(context); },
      telemetryTag: 'llm.gm-summary'
    })
  }

  #canSummarize(context: GraphContext): boolean {
    const hasMessage = context.gmResponse !== undefined;
    const hasIntent = context.playerIntent !== undefined;
    return hasMessage && hasIntent;
  }

  #applySummary(context: GraphContext,response: SummaryResponse): GraphContext {
    return {
      ...context,
      gmSummary: response.summary,
      shouldCloseChronicle: response.shouldCloseChronicle,
    }
  }
}

export { GmSummaryNode };
