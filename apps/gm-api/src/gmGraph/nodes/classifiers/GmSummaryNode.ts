import { SceneOutcome } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import { z } from 'zod';

import type { GraphContext } from '../../../types.js';
import type { GraphNodeDelta } from '../graphNode';
import { LlmClassifierNode } from './LlmClassiferNode';

const SummaryResponseSchema = z.object({
  sceneOutcome: SceneOutcome.default('continue'),
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
    if (sceneOutcome !== 'continue' && context.effectiveScene !== null) {
      log('info', 'gm.scene-completed', {
        chronicleId: context.chronicleId,
        outcome: sceneOutcome,
        reason: response.sceneOutcomeReason ?? 'unspecified',
        sceneId: context.effectiveScene.id,
        subject: context.effectiveScene.subject,
        turnSequence: context.turnSequence,
        type: context.effectiveScene.type,
      });
    }
    return {
      gmSummary: response.summary,
      sceneOutcome,
      sceneOutcomeReason: sceneOutcome === 'continue' ? null : response.sceneOutcomeReason,
      shouldCloseChronicle: response.shouldCloseChronicle,
    };
  }
}

export { GmSummaryNode };
