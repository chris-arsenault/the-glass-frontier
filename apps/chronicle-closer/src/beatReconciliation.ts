import type { ModelConfigStore, PromptTemplateManager } from '@glass-frontier/app';
import { PromptTemplateRuntime } from '@glass-frontier/app';
import type { ChronicleBeat } from '@glass-frontier/dto';
import type { LLMPlayer, LLMRequest, RetryLLMClient } from '@glass-frontier/llm-client';
import { log } from '@glass-frontier/utils';
import type { ChronicleSnapshot, ChronicleStore } from '@glass-frontier/worldstate';
import { z } from 'zod';

import { buildTurnArtifacts } from './summaryHelpers';

const RECONCILE_MAX_TOKENS = 800;

const reconciliationSchema = (
  beatIds: [string, ...string[]]
): z.ZodType<{ dispositions: Array<{ beatId: string; reason: string; status: 'abandoned' | 'failed' | 'succeeded' }> }> =>
  z.object({
    dispositions: z.array(
      z.object({
        beatId: z.enum(beatIds),
        reason: z.string().min(1).describe('One sentence grounded in the transcript.'),
        status: z
          .enum(['succeeded', 'failed', 'abandoned'])
          .describe('succeeded or failed when the story earned that outcome; abandoned when the story walked away.'),
      })
    ),
  });

/**
 * A closed chronicle leaves no beat open. Any beat still in_progress at
 * closure gets a final disposition judged from the transcript, so the story
 * record and the canon extraction read a finished goal history.
 */
export const reconcileOpenBeats = async (input: {
  chronicleStore: ChronicleStore;
  llm: RetryLLMClient;
  modelConfigStore: ModelConfigStore;
  player: LLMPlayer;
  snapshot: ChronicleSnapshot;
  templateManager: PromptTemplateManager;
}): Promise<boolean> => {
  const { chronicleStore, llm, modelConfigStore, player, snapshot, templateManager } = input;
  const chronicle = snapshot.chronicle;
  const openBeats = chronicle.beats.filter((beat) => beat.status === 'in_progress');
  const [first, ...rest] = openBeats.map((beat) => beat.id);
  if (first === undefined) {
    return false;
  }
  const runtime = new PromptTemplateRuntime({
    manager: templateManager,
    playerId: chronicle.playerId,
  });
  const [instructions, model] = await Promise.all([
    runtime.render('beat-reconciler', {}),
    modelConfigStore.getModelForCategory('classification', chronicle.playerId),
  ]);
  const response = await llm.generateStructured(
    reconciliationRequest({ instructions, model, openBeats, player, snapshot }),
    reconciliationSchema([first, ...rest]),
    'beat_reconciliation'
  );
  const changed = await chronicleStore.finalizeBeats({
    chronicleId: chronicle.id,
    dispositions: response.data.dispositions.map(({ beatId, status }) => ({ beatId, status })),
  });
  log('info', 'chronicle-closer.beats-reconciled', {
    changed,
    chronicleId: chronicle.id,
    dispositions: response.data.dispositions
      .map((entry) => `${entry.beatId}:${entry.status} (${entry.reason})`)
      .join('; '),
  });
  return changed;
};

const developerJson = (payload: Record<string, unknown>): LLMRequest['input'][number] => ({
  content: [{ text: JSON.stringify(payload, null, 2), type: 'input_text' }],
  role: 'developer',
});

const reconciliationRequest = (input: {
  instructions: string;
  model: string;
  openBeats: ChronicleBeat[];
  player: LLMPlayer;
  snapshot: ChronicleSnapshot;
}): LLMRequest => ({
  input: [
    developerJson({ openBeats: input.openBeats.map(describeBeat) }),
    developerJson({ transcript: buildTurnArtifacts(input.snapshot.turns).transcript }),
    {
      content: [{ text: 'Give each open beat its final disposition.', type: 'input_text' }],
      role: 'user',
    },
  ],
  instructions: input.instructions,
  maxOutputTokens: RECONCILE_MAX_TOKENS,
  metadata: {
    chronicleId: input.snapshot.chronicle.id,
    operation: 'chronicle-closer.beat-reconcile',
    playerId: input.snapshot.chronicle.playerId,
  },
  model: input.model,
  player: input.player,
  reasoningEffort: 'low',
});

const describeBeat = (beat: ChronicleBeat): Record<string, unknown> => ({
  description: beat.description,
  id: beat.id,
  lastProgressTurn: beat.lastProgressTurn ?? null,
  startedAt: beat.createdAt,
  title: beat.title,
});
