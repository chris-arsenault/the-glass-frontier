import type { IntentBeatDirective } from '@glass-frontier/worldstate';
import { z } from 'zod';

import { composeBeatDetectorPrompt } from '../../prompts';
import type { StructuredLlmClient } from '../structuredLlmClient';
import { LlmClassifierNode } from './LlmClassifierNode';

const BeatDirectiveSchema = z.object({
  kind: z.enum(['existing', 'new', 'independent']),
  summary: z.string().nullable().optional(),
  targetBeatId: z.string().uuid().nullable().optional(),
});

type BeatDirectiveResult = z.infer<typeof BeatDirectiveSchema>;

export class BeatDetectorNode extends LlmClassifierNode<BeatDirectiveResult> {
  constructor(client: StructuredLlmClient) {
    super(client, {
      applyResult: (context, result) => {
        const playerIntent = context.turnDraft.playerIntent;
        if (playerIntent === undefined) {
          return { ...context, failure: true };
        }
        return {
          ...context,
          turnDraft: {
            ...context.turnDraft,
            playerIntent: {
              ...playerIntent,
              beatDirective: normalizeDirective(result),
            },
          },
        };
      },
      buildPrompt: (context) =>
        composeBeatDetectorPrompt({
          beats: context.beats,
          chronicle: context.chronicle,
          intentSummary: context.turnDraft.playerIntent?.summary ?? '',
          playerMessage: context.playerMessage.content ?? '',
        }),
      id: 'beat-detector',
      schema: BeatDirectiveSchema,
      telemetryTag: 'llm.beat-detector',
    });
  }
}

const normalizeDirective = (result: BeatDirectiveResult): IntentBeatDirective => {
  if (result.kind === 'existing') {
    return {
      kind: 'existing' as const,
      summary: result.summary ?? undefined,
      targetBeatId: result.targetBeatId ?? undefined,
    };
  }
  if (result.kind === 'new') {
    return { kind: 'new' as const, summary: result.summary ?? undefined };
  }
  return { kind: 'independent' as const, summary: result.summary ?? undefined };
};
