import { z } from 'zod';

import { composeGmSummaryPrompt } from '../../prompts';
import type { StructuredLlmClient } from '../structuredLlmClient';
import { LlmClassifierNode } from './LlmClassifierNode';

const GmSummaryResultSchema = z.object({
  shouldCloseChronicle: z.boolean().default(false),
  summary: z.string().min(1),
});

type GmSummaryResult = z.infer<typeof GmSummaryResultSchema>;

export class GmSummaryNode extends LlmClassifierNode<GmSummaryResult> {
  constructor(client: StructuredLlmClient) {
    super(client, {
      applyResult: (context, result) => {
        const nextEffects = result.shouldCloseChronicle
          ? { ...context.effects, chronicleShouldClose: true }
          : context.effects;
        return {
          ...context,
          effects: nextEffects,
          turnDraft: {
            ...context.turnDraft,
            gmSummary: result.summary,
          },
        };
      },
      buildPrompt: (context) =>
        composeGmSummaryPrompt({
          character: context.character,
          chronicle: context.chronicle,
          gmMessage: context.turnDraft.gmMessage?.content ?? '',
          playerIntent: context.turnDraft.playerIntent,
          skillCheckPlan: context.turnDraft.skillCheckPlan,
          skillCheckResult: context.turnDraft.skillCheckResult,
          turnSequence: context.turnSequence,
        }),
      id: 'gm-summary',
      schema: GmSummaryResultSchema,
      telemetryTag: 'llm.gm-summary',
    });
  }
}
