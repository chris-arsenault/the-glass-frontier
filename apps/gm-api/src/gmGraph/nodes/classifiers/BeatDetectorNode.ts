import type { ChronicleBeat, IntentBeatDirective } from '@glass-frontier/dto';
import { LlmClassifierNode } from '@glass-frontier/gm-api/gmGraph/nodes/classifiers/LlmClassiferNode';
import { z } from 'zod';

import type { GraphContext } from '../../../types';

export const BeatDirectiveSchema = z.object({
  kind: z
    .enum(['existing', 'new', 'independent'])
    .describe('Beat targeting: existing beat, new beat, or standalone turn.'),
  summary: z
    .string()
    .min(1)
    .describe('Brief rationale for the classification.'),
  targetBeatSlug: z
    .string()
    .min(1)
    .nullable()
    .describe('Beat slug when kind="existing"; otherwise null.'),
});

export type BeatDirective = z.infer<typeof BeatDirectiveSchema>;
class BeatDetectorNode extends LlmClassifierNode<BeatDirective> {
  readonly id = 'intent-beat-detector';
  constructor() {
    super({
      applyResult: (context, result) => this.#applyBeatDirective(context, result),
      id: 'intent-beat-detector',
      schema: BeatDirectiveSchema,
      schemaName: 'intent_beat_detector',
      shouldRun: (context) => context.playerIntent !== undefined,
      telemetryTag: 'llm.intent-beat-detector'
    });
  }

  #normalizeDirective(
    directive: BeatDirective,
    beats: ChronicleBeat[]
  ): IntentBeatDirective {
    if (directive.kind === 'existing' && directive.targetBeatSlug !== null) {
      const targetBeat = beats.find((beat) => beat.slug === directive.targetBeatSlug);
      return {
        kind: directive.kind,
        summary: directive.summary,
        targetBeatId: targetBeat?.id ?? null,
      };
    }
    return {
      kind: directive.kind,
      summary: directive.summary,
      targetBeatId: null
    };
  }

  #applyBeatDirective(context: GraphContext, result: BeatDirective): GraphContext {
    const playerIntent = context.playerIntent;
    if (playerIntent === undefined) {
      throw new Error('Beat detector requires a classified player intent.');
    }
    const beatDirective = this.#normalizeDirective(
      result,
      context.chronicleState.chronicle.beats
    );
    return {
      ...context,
      playerIntent: {
        ...playerIntent,
        beatDirective,
      },
    };
  }
}

export { BeatDetectorNode };
