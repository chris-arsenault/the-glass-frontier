import { type Intent, IntentType } from '@glass-frontier/dto';
import type { GraphContext } from '@glass-frontier/gm-api/types';
import { z } from 'zod';

import { LlmClassifierNode } from './LlmClassiferNode';

const IntentResponseSchema = z.object({
  creativeSpark: z
    .boolean()
    .describe('True when the player intent expresses improvisational or imaginative action.'),
  handlerHints: z
    .array(
      z
        .string()
        .min(1)
        .describe('Lowercase hint that nudges downstream narration (e.g., "whispered").')
    )
    .max(8)
    .describe('Ordered list of handler hints; emit an empty array when none apply.'),
  intentSummary: z
    .string()
    .min(1)
    .describe('Concise paraphrase of the player’s request (≤ 140 characters).'),
  intentType: IntentType.describe('One of the canonical Glass Frontier intent types.'),
  routerRationale: z
    .string()
    .min(1)
    .describe('Single sentence explaining why the classification was chosen.'),
  tone: z.string().min(1).describe('Narrative tone adjective grounded in the current scene.'),
});

type IntentResponse = z.infer<typeof IntentResponseSchema>;
const NODE_ID = 'intent-classifier';

class IntentClassifierNode extends LlmClassifierNode<IntentResponse> {
  readonly id = NODE_ID;
  constructor() {
    super({
      applyResult: (context, result) => this.#applyIntent(context, result),
      id: NODE_ID,
      schema: IntentResponseSchema,
      schemaName: 'intent_response_schema',
      shouldRun: () => true,
      telemetryTag: `llm.${NODE_ID}`
    });
  }

  #applyIntent(context: GraphContext, result: IntentResponse): GraphContext {
    const intent: Intent = {
      beatDirective: {
        kind: 'independent',
        summary: 'Placeholder - will be replaced by beat detector',
        targetBeatId: null
      },
      creativeSpark: result.creativeSpark,
      handlerHints: result.handlerHints,
      intentSummary: result.intentSummary,
      intentType: result.intentType,
      metadata: {
        tags: ['source:intent-classifier'],
        timestamp: Date.now(),
      },
      routerRationale: result.routerRationale,
      tone: result.tone,
    };
    return {
      ...context,
      playerIntent: intent,
    };
  }
}

export { IntentClassifierNode };
