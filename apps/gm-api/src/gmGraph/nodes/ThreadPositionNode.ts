import type { NarrativeThread } from '@glass-frontier/dto';
import { isNonEmptyString, log } from '@glass-frontier/utils';

import type { GraphContext } from '../../types';
import type { GraphNode, GraphNodeDelta } from './graphNode';

const MAX_OUTPUT_TOKENS = 4_000;

const focusedPlayerThread = (context: GraphContext): NarrativeThread | undefined =>
  context.effectiveThreads.find(
    (candidate) => candidate.id === context.effectiveFocusedThreadId
      && candidate.perspective === 'player'
  );

const canUpdatePosition = (
  context: GraphContext,
  thread: NarrativeThread | undefined
): thread is NarrativeThread => !context.failure
  && context.sceneBoundary
  && thread !== undefined
  && isNonEmptyString(context.gmResponse?.content);

const buildPositionInput = (context: GraphContext, thread: NarrativeThread): string => [
  `THREAD TITLE: ${thread.title}`,
  `GOAL: ${thread.goal}`,
  `PRIOR POSITION: ${thread.position}`,
  `SCENE QUESTION: ${context.effectiveScene?.question ?? 'The player left the active scene.'}`,
  `GM NARRATION: ${context.gmResponse!.content}`,
].join('\n\n');

const requestPosition = async (
  context: GraphContext,
  thread: NarrativeThread,
  nodeId: string
): Promise<string> => {
  const playerId = context.chronicleState.chronicle.playerId;
  const model = await context.modelConfigStore.getModelForCategory('classification', playerId);
  const instructions = await context.templates.render('thread-position', {});
  const response = await context.llm.generate({
    input: [{
      content: [{ text: buildPositionInput(context, thread), type: 'input_text' }],
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

export class ThreadPositionNode implements GraphNode {
  readonly id = 'thread-position';

  async execute(context: GraphContext): Promise<GraphNodeDelta> {
    const thread = focusedPlayerThread(context);
    if (!canUpdatePosition(context, thread)) {
      return {};
    }

    try {
      const position = await requestPosition(context, thread, this.id);
      return position.length === 0 ? {} : { threadPositionUpdate: { position, threadId: thread.id } };
    } catch (error) {
      log('warn', 'gm.thread-position-failed', {
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        turnId: context.turnId,
      });
      return {};
    }
  }
}
