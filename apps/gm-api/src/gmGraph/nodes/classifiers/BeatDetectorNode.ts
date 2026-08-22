import type { ChronicleBeat, IntentBeatDirective } from '@glass-frontier/dto';
import { LlmClassifierNode } from '@glass-frontier/gm-api/gmGraph/nodes/classifiers/LlmClassiferNode';
import { z, type ZodType } from 'zod';

import type { GraphContext } from '../../../types';
import type { GraphNodeDelta } from '../graphNode';

const beatDirectiveSchema = (beatIds: string[]): ZodType<BeatDirective> => {
  const targetBeatId = beatIds.length === 0
    ? z.null()
    : z.enum(beatIds as [string, ...string[]]).nullable();
  return z.object({
    kind: z
      .enum(['existing', 'new', 'independent'])
      .describe('Beat targeting: existing beat, new beat, or standalone turn.'),
    summary: z
      .string()
      .min(1)
      .describe('Brief rationale for the classification.'),
    targetBeatId: targetBeatId.describe(
      'The `id` of the targeted beat when kind="existing"; otherwise null.'
    ),
  });
};

export type BeatDirective = {
  kind: 'existing' | 'new' | 'independent';
  summary: string;
  targetBeatId: string | null;
};
class BeatDetectorNode extends LlmClassifierNode<BeatDirective> {
  readonly id = 'intent-beat-detector';
  constructor() {
    super({
      applyResult: (context, result) => this.#applyBeatDirective(context, result),
      id: 'intent-beat-detector',
      schema: (context) => beatDirectiveSchema(
        context.chronicleState.chronicle.beats.map((beat) => beat.id)
      ),
      schemaName: 'intent_beat_detector',
      shouldRun: (context) =>
        context.playerIntent !== undefined
        && context.chronicleState.chronicle.beatsEnabled !== false,
      telemetryTag: 'llm.intent-beat-detector'
    });
  }

  #normalizeDirective(
    directive: BeatDirective,
    beats: ChronicleBeat[]
  ): IntentBeatDirective {
    if (directive.kind === 'existing' && directive.targetBeatId !== null) {
      const targetBeat = beats.find((beat) => beat.id === directive.targetBeatId);
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

  #applyBeatDirective(context: GraphContext, result: BeatDirective): GraphNodeDelta {
    const playerIntent = context.playerIntent;
    if (playerIntent === undefined) {
      throw new Error('Beat detector requires a classified player intent.');
    }
    const beatDirective = this.#normalizeDirective(
      result,
      context.chronicleState.chronicle.beats
    );
    return {
      playerIntent: {
        ...playerIntent,
        beatDirective,
      },
    };
  }
}

export { BeatDetectorNode };
