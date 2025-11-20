import type { GraphContext,  } from '../../../types';
import {LlmClassifierNode} from "@glass-frontier/gm-api/gmGraph/nodes/classifiers/LlmClassiferNode";
import { z } from "zod";
import {IntentBeatDirective} from "@glass-frontier/dto";

export const BeatDirectiveSchema = z.object({
  kind: z
    .enum(['existing', 'new', 'independent'])
    .describe('Beat targeting: existing beat, new beat, or standalone turn.'),
  summary: z
    .string()
    .min(1)
    .describe('Brief rationale for the classification.'),
  targetBeatId: z
    .string()
    .min(1)
    .nullable()
    .describe('Beat ID when kind="existing"; otherwise null.'),
});

export type BeatDirective = z.infer<typeof BeatDirectiveSchema>;
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
