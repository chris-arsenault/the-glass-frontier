import type { Intent } from '@glass-frontier/worldstate';
import { z } from 'zod';

import { composeIntentPrompt } from '../../prompts';
import type { StructuredLlmClient } from '../structuredLlmClient';
import { LlmClassifierNode } from './LlmClassifierNode';

const IntentClassifierResultSchema = z.object({
  attribute: z.string().optional(),
  creativeSpark: z.boolean(),
  handlerHints: z.array(z.string().min(1)).max(8).default([]),
  intentKind: z.enum(['action', 'clarification', 'inquiry', 'planning', 'possibility', 'reflection']),
  intentSummary: z.string().min(1),
  requiresCheck: z.boolean(),
  skill: z.string().optional(),
  tone: z.string().min(1),
});

type IntentClassifierResult = z.infer<typeof IntentClassifierResultSchema>;

export class IntentClassifierNode extends LlmClassifierNode<IntentClassifierResult> {
  constructor(client: StructuredLlmClient) {
    super(client, {
      applyResult: (context, result) => {
        const intent: Intent = {
          attribute: result.attribute ?? 'focus',
          creativeSpark: result.creativeSpark,
          handlerHints: result.handlerHints,
          metadata: {
            source: 'intent-classifier',
            timestamp: Date.now(),
          },
          requiresCheck: result.requiresCheck,
          skill: result.skill ?? 'improvise',
          summary: result.intentSummary,
          tone: result.tone,
        };
        return {
          ...context,
          turnDraft: {
            ...context.turnDraft,
            playerIntent: intent,
            resolvedIntentType: result.intentKind,
          },
        };
      },
      buildPrompt: (context) =>
        composeIntentPrompt({
          character: context.character,
          chronicle: context.chronicle,
          playerMessage: context.playerMessage.content ?? '',
        }),
      id: 'intent-classifier',
      schema: IntentClassifierResultSchema,
      telemetryTag: 'llm.intent-classifier',
    });
  }
}
