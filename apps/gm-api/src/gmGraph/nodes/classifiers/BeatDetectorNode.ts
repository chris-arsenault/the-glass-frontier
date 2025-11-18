import type {Intent, IntentBeatDirective} from '@glass-frontier/dto';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import type { GraphContext, LangGraphLlmLike } from '../../types';
import type { GraphNode } from '../orchestrator';
import { composeIntentBeatDetectorPrompt } from '../prompts/prompts';
import {LlmClassifierNode} from "@glass-frontier/gm-api/gmGraph/nodes/classifiers/LlmClassiferNode";

const BeatDirectiveSchema = z.object({
    kind: z
      .enum(['existing', 'new', 'independent'])
      .describe('Classification describing whether the turn advances an existing beat, creates a new one, or stands alone.'),
    summary: z
      .string()
      .min(1)
      .describe('Short justification pointing to the stakes or clue driving the decision.'),
    targetBeatId: z
      .string()
      .min(1)
      .nullable()
      .describe('ID of the referenced beat when kind is "existing"; null otherwise.'),
});


type BeatDirective = z.infer<typeof BeatDirectiveSchema>;

class BeatDetectorNode extends LlmClassifierNode<BeatDirective> {
  readonly id = 'intent-beat-detector';
  constructor() {
    super({
      id: 'intent-beat-detector',
      schema: BeatDirectiveSchema,
      schemaName: 'intent_beat_detector',
      applyResult: (context, result) => this.#applyBeatDirective(context, result),
      shouldRun: (context) => context.playerIntent !== undefined,
      telemetryTag: 'llm.intent-beat-detector'
    })
  }

  #normalizeDirective(
    directive: BeatDirective
  ): IntentBeatDirective {
    if (directive.kind === 'existing') {
      return directive;
    }
    return {
      ...directive,
      targetBeatId: null
    }
  }

  #applyBeatDirective(context, result: BeatDirective): GraphContext  {
    const beatDirective: IntentBeatDirective = this.#normalizeDirective(result)
    return {
      ...context,
      playerIntent: {
        ...context.playerIntent,
        beatDirective,
      },
    };
  }
}

export { BeatDetectorNode };
