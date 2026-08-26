import {
  BeatTrackerSchema,
  LocationDeltaDecision,
  SceneOutcome,
} from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import { z } from 'zod';

import { SceneLedgerUpdateSchema } from '../../../scenes/sceneLedger';
import type { GraphContext } from '../../../types';
import type { GraphNodeDelta } from '../graphNode';
import { LlmClassifierNode } from './LlmClassiferNode';

/**
 * One post-narration judgment instead of four. The summary, beat updates,
 * scene outcome, scene ledger, and location decision all answer the same
 * question — given this narration, what is now true? — from the same context,
 * so they share a single call, and a judgment that closes a scene can no
 * longer disagree with the one that tracks its beats.
 */
const TurnJudgeSchema = z.object({
  beats: BeatTrackerSchema.omit({ tags: true }),
  ledger: SceneLedgerUpdateSchema,
  location: LocationDeltaDecision,
  /**
   * How far the turn moved the scene toward resolving. The clock used to move
   * only on a die roll, so a scene of conversation never advanced no matter
   * what happened in it.
   */
  sceneClockSegments: z.number().int().min(0).max(3).default(0),
  sceneOutcome: SceneOutcome.default('continue'),
  sceneOutcomeReason: z.string().min(1).nullable().default(null),
  shouldCloseChronicle: z.boolean(),
  summary: z.string().min(1),
});

type TurnJudgeResponse = z.infer<typeof TurnJudgeSchema>;

const TURN_JUDGE_MAX_TOKENS = 3000;

class TurnJudgeNode extends LlmClassifierNode<TurnJudgeResponse> {
  readonly id = 'turn-judge';

  constructor() {
    super({
      applyResult: (context, result) => this.#applyJudgment(context, result),
      id: 'turn-judge',
      maxOutputTokens: TURN_JUDGE_MAX_TOKENS,
      schema: TurnJudgeSchema,
      schemaName: 'turn_judge_response',
      shouldRun: (context) =>
        !context.failure
        && context.gmResponse !== undefined
        && context.playerIntent !== undefined,
      telemetryTag: 'llm.turn-judge',
    });
  }

  #applyJudgment(context: GraphContext, result: TurnJudgeResponse): GraphNodeDelta {
    const sceneOutcome = context.effectiveScene === null ? 'continue' : result.sceneOutcome;
    if (sceneOutcome !== 'continue' && context.effectiveScene !== null) {
      log('info', 'gm.scene-completed', {
        chronicleId: context.chronicleId,
        outcome: sceneOutcome,
        reason: result.sceneOutcomeReason ?? 'unspecified',
        sceneId: context.effectiveScene.id,
        subject: context.effectiveScene.subject,
        turnSequence: context.turnSequence,
        type: context.effectiveScene.type,
      });
    }
    return {
      beatTracker: { ...result.beats, tags: this.#loreTags(context) },
      gmSummary: result.summary,
      locationDelta: result.location,
      sceneClockSegments: result.sceneClockSegments,
      sceneLedgerUpdate: result.ledger,
      sceneOutcome,
      sceneOutcomeReason: sceneOutcome === 'continue' ? null : result.sceneOutcomeReason,
      shouldCloseChronicle: result.shouldCloseChronicle,
    };
  }

  #loreTags(context: GraphContext): string[] {
    const loreTags = new Set<string>();
    const anchorId = context.chronicleState.chronicle.anchorEntityId;
    if (anchorId !== undefined) {
      loreTags.add(`lore:anchor:${anchorId}`);
    }
    for (const entityId of context.entityContext?.focusEntities ?? []) {
      loreTags.add(`lore:entity:${entityId}`);
    }
    for (const tag of context.entityContext?.focusTags ?? []) {
      loreTags.add(`lore:tag:${tag}`);
    }
    return Array.from(loreTags);
  }
}

export { TurnJudgeNode };
