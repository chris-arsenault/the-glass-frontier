import { isNonEmptyString, log } from '@glass-frontier/utils';

import type { GraphContext } from '../../types';
import { resolveLocationName } from '../../updaters/locationUpdater';
import type { GraphNode, GraphNodeDelta } from './graphNode';

const MAX_OUTPUT_TOKENS = 4_000;

const shouldUpdateContinuity = (context: GraphContext, locationName: string): boolean =>
  !context.failure
  && (context.sceneBoundary || locationName !== context.chronicleState.locationName)
  && isNonEmptyString(context.gmResponse?.content);

const buildContinuityInput = (context: GraphContext, locationName: string): string => {
  const prior = context.chronicleState.chronicle.localContinuity;
  return [
    `LOCATION: ${locationName}`,
    prior !== null && prior.locationName === locationName
      ? `PRIOR LOCAL CONTINUITY: ${prior.note}`
      : 'PRIOR LOCAL CONTINUITY: none',
    `GM NARRATION: ${context.gmResponse!.content}`,
  ].join('\n\n');
};

const requestContinuity = async (
  context: GraphContext,
  locationName: string,
  nodeId: string
): Promise<string> => {
  const playerId = context.chronicleState.chronicle.playerId;
  const model = await context.modelConfigStore.getModelForCategory('classification', playerId);
  const instructions = await context.templates.render('local-continuity', {});
  const response = await context.llm.generate({
    input: [{
      content: [{ text: buildContinuityInput(context, locationName), type: 'input_text' }],
      role: 'user',
    }],
    instructions,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    metadata: {
      chronicleId: context.chronicleId,
      nodeId,
      playerId,
      turnId: context.turnId,
      turnSequence: String(context.turnSequence),
    },
    model,
    player: context.llmPlayer,
    reasoningEffort: 'low',
  }, 'string');
  return typeof response.message === 'string' ? response.message.trim() : '';
};

export class LocalContinuityNode implements GraphNode {
  readonly id = 'local-continuity';

  async execute(context: GraphContext): Promise<GraphNodeDelta> {
    const locationName = resolveLocationName(context);
    if (!shouldUpdateContinuity(context, locationName)) {
      return {};
    }

    try {
      const note = await requestContinuity(context, locationName, this.id);
      return note.length === 0
        ? {}
        : { localContinuityUpdate: { locationName, note, updatedAtTurn: context.turnSequence } };
    } catch (error) {
      log('warn', 'gm.local-continuity-failed', {
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        turnId: context.turnId,
      });
      return {};
    }
  }
}
