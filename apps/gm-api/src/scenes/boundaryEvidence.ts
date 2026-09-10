import { renderBlock } from '@glass-frontier/app';
import type { ActiveScene, Turn } from '@glass-frontier/dto';

import type { GraphContext } from '../types';

type EvidenceTurn = Pick<Turn,
  'gmResponse' | 'playerMessage' | 'skillCheckPlan' | 'skillCheckResult' | 'turnSequence' | 'worldContent'
>;

/** Stored prose and checks are evidence; a display summary is not a substitute. */
const renderEvidenceTurn = (turn: EvidenceTurn): string => renderBlock({
  check: turn.skillCheckResult === undefined ? undefined : {
    outcome: turn.skillCheckResult.outcomeTier,
    skill: turn.skillCheckPlan?.skill,
  },
  gm: turn.gmResponse?.content,
  player: turn.playerMessage.content,
  turn: turn.turnSequence,
  worldAfterNarration: turn.worldContent,
});

export const currentTurnEvidence = (context: GraphContext): string => renderEvidenceTurn(context);

export const completedSceneEvidence = async (
  context: GraphContext,
  scene: ActiveScene
): Promise<string> => {
  const turns = await context.chronicleStore.listSceneTurns({
    chronicleId: context.chronicleId,
    sceneId: scene.id,
  });
  return [
    `SCENE QUESTION: ${scene.question}`,
    ...turns.map(renderEvidenceTurn),
    currentTurnEvidence(context),
  ].join('\n\n');
};

/** Include every committed turn since the last local note, including inquiries. */
export const localBoundaryEvidence = (context: GraphContext): string => {
  const since = context.chronicleState.chronicle.localContinuity?.updatedAtTurn ?? -1;
  return [
    ...context.chronicleState.turns
      .filter((turn) => !turn.failure && turn.turnSequence > since)
      .map(renderEvidenceTurn),
    currentTurnEvidence(context),
  ].join('\n\n');
};
