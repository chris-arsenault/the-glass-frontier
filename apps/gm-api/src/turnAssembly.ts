import type { TranscriptEntry, Turn } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';

import { buildSceneContext } from './scenes/sceneLifecycle';
import type { GraphContext } from './types';

export const buildSystemErrorEntry = (message: string): TranscriptEntry => ({
  content: message,
  id: randomUUID(),
  metadata: {
    tags: ['system-failure'],
    timestamp: Date.now(),
  },
  role: 'system',
});

/**
 * Every failed turn carries a player-facing notice. Without one, a node-level
 * failure produced a blank turn, and a guardrail-blocked generation once
 * leaked the provider's refusal text as GM prose.
 */
export const ensureFailureNotice = (
  graphResult: GraphContext,
  systemMessage?: TranscriptEntry
): TranscriptEntry | undefined => {
  if (systemMessage !== undefined || !graphResult.failure) {
    return systemMessage;
  }
  const content =
    graphResult.failureReason === 'content_filter'
      ? 'The narrator declined that action as written. Nothing has changed — rephrase it with less graphic detail and try again.'
      : 'The turn could not be completed. Nothing has changed — try again, or take a different approach.';
  return buildSystemErrorEntry(content);
};

type NarrativeFields = Pick<
  Turn,
  'beatTracker' | 'gmResponse' | 'gmSummary' | 'inventoryDelta' | 'locationDelta'
>;

/**
 * A failed turn's world updates were discarded, so narration and deltas
 * describing them must not survive either: showing prose whose effects never
 * happened forces the player to correct the GM afterwards.
 */
export const narrativeFields = (graphResult: GraphContext, failure: boolean): NarrativeFields =>
  failure
    ? {
      beatTracker: undefined,
      gmResponse: undefined,
      gmSummary: undefined,
      inventoryDelta: undefined,
      locationDelta: undefined,
    }
    : {
      beatTracker: graphResult.beatTracker,
      gmResponse: graphResult.gmResponse,
      gmSummary: graphResult.gmSummary,
      inventoryDelta: graphResult.inventoryDelta,
      locationDelta: graphResult.locationDelta,
    };

const governingSceneContext = (
  graphResult: GraphContext,
  failure: boolean
): ReturnType<typeof buildSceneContext> => {
  const scene = failure
    ? graphResult.chronicleState.chronicle.activeScene
    : graphResult.effectiveScene;
  return buildSceneContext(
    scene,
    failure ? 'continue' : graphResult.sceneOutcome,
    failure ? null : graphResult.sceneOutcomeReason
  );
};

export const buildTurn = (input: {
  chronicleId: string;
  graphResult: GraphContext;
  playerMessage: TranscriptEntry;
  systemMessage?: TranscriptEntry;
  turnId: string;
  turnSequence: number;
}): Turn => {
  const failure = input.graphResult.failure || input.systemMessage !== undefined;
  return {
    ...narrativeFields(input.graphResult, failure),
    advancesTimeline: input.graphResult.advancesTimeline,
    chronicleId: input.chronicleId,
    entityReferences: input.graphResult.entityReferences,
    entityRoster: input.graphResult.turnEntityRoster,
    entityUsage: input.graphResult.entityUsage,
    executedNodes: input.graphResult.executedNodes,
    failure,
    gmTrace: input.graphResult.gmTrace === null ? undefined : input.graphResult.gmTrace,
    id: input.turnId,
    playerIntent: input.graphResult.playerIntent,
    playerMessage: input.playerMessage,
    playerReferenceSlugs: input.graphResult.playerReferenceSlugs,
    proseCostUsd: failure ? undefined : input.graphResult.proseCostUsd,
    referenceMentions: input.graphResult.referenceMentions,
    referenceUsage: input.graphResult.referenceUsage,
    sceneContext: governingSceneContext(input.graphResult, failure),
    skillCheckPlan: input.graphResult.skillCheckPlan,
    skillCheckResult: input.graphResult.skillCheckResult,
    systemMessage: input.systemMessage,
    turnSequence: input.turnSequence,
    worldContent: input.graphResult.worldContent,
    worldFronts: input.graphResult.worldFronts,
  };
};
