import { z } from 'zod';
import  { type Intent, IntentType  } from '@glass-frontier/dto';
import { LlmClassifierNode } from "./LlmClassiferNode";
import {GraphContext} from "@glass-frontier/gm-api/types";

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

class IntentClassifierNode extends LlmClassifierNode<IntentResponse> {
  readonly id = 'intent-classifier';
  constructor() {
    super({
      id: 'intent-classifier',
      schema: IntentResponseSchema,
      schemaName: 'intent_response_schema',
      applyResult: (context, result) => this.#applyIntent(context, result),
      shouldRun: (context) => {return true},
      telemetryTag: 'llm.intent-classifier'
    })
  }

  #applyIntent(context, result: IntentResponse): GraphContext  {
    const intent: Intent = {
      creativeSpark: result.creativeSpark,
      handlerHints: result.handlerHints,
      intentSummary: result.intentSummary,
      intentType: result.intentType,
      metadata: {
        source: 'intent-classifier',
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
