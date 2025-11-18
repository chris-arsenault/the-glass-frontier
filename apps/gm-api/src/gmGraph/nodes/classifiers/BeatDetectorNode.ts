import type { IntentBeatDirective} from '@glass-frontier/dto';
import { z } from 'zod';

import type { GraphContext,  } from '../../../types';
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
      shouldRun: (context) => { return context.playerIntent !== undefined },
      telemetryTag: 'llm.intent-beat-detector'
    })
  }

  #normalizeDirective(directive: BeatDirective): IntentBeatDirective {
    if (directive.kind === 'existing') {
      return directive;
    }
    return {
      ...directive,
      targetBeatId: null
    }
  }

  #applyBeatDirective(context: GraphContext, result: BeatDirective): GraphContext  {
    const beatDirective: IntentBeatDirective = this.#normalizeDirective(result)
    return {
      ...context,
      playerIntent: {
        ...context?.playerIntent,
        beatDirective,
      },
    };
  }
}

export { BeatDetectorNode };
