import { isNonEmptyString, log } from '@glass-frontier/utils';
import { z } from 'zod';

import { completedSceneEvidence, currentTurnEvidence } from '../../scenes/boundaryEvidence';
import { isConsequentialIntent } from '../../scenes/boundedScene';
import type { GraphContext } from '../../types';
import type { GraphNode, GraphNodeDelta } from './graphNode';

const BoundaryDecision = z.object({
  sceneAnswered: z.boolean(),
  timePassed: z.boolean(),
});

const needsBoundaryRead = (context: GraphContext): boolean =>
  !context.failure
  && !context.sceneWillClose
  && isNonEmptyString(context.gmResponse?.content)
  && (context.effectiveScene !== null
    || (context.playerIntent !== undefined && isConsequentialIntent(context.playerIntent.intentType)));

/** Reads only whether completed fiction establishes a story boundary. */
export class NarrativeBoundaryNode implements GraphNode {
  readonly id = 'narrative-boundary';

  async execute(context: GraphContext): Promise<GraphNodeDelta> {
    if (!needsBoundaryRead(context)) {
      return {};
    }
    try {
      const decision = await this.#read(context);
      const scene = context.effectiveScene;
      return decision.sceneAnswered && scene !== null ? {
        completedScenes: [...context.completedScenes, scene],
        sceneBoundary: true,
        sceneWillClose: true,
        timePassed: decision.timePassed,
      } : { timePassed: decision.timePassed };
    } catch (error) {
      log('warn', 'gm.narrative-boundary-failed', {
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        turnId: context.turnId,
      });
      return {};
    }
  }

  async #read(context: GraphContext): Promise<z.infer<typeof BoundaryDecision>> {
    const playerId = context.chronicleState.chronicle.playerId;
    const model = await context.modelConfigStore.getModelForCategory('classification', playerId);
    const evidence = context.effectiveScene === null
      ? `SCENE QUESTION: none\n\n${currentTurnEvidence(context)}`
      : await completedSceneEvidence(context, context.effectiveScene);
    const response = await context.llm.generateStructured({
      input: [{ content: [{ text: evidence, type: 'input_text' }], role: 'user' }],
      instructions: await context.templates.render('narrative-boundary', {}),
      maxOutputTokens: 16_000,
      metadata: {
        chronicleId: context.chronicleId,
        nodeId: this.id,
        playerId,
        turnId: context.turnId,
        turnSequence: String(context.turnSequence),
      },
      model,
      player: context.llmPlayer,
      reasoningEffort: 'low',
    }, BoundaryDecision, 'narrative_boundary');
    return response.data;
  }
}
