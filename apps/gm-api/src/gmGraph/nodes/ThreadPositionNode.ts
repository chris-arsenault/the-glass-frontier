import type { ActiveScene, NarrativeThread } from '@glass-frontier/dto';
import { isNonEmptyString, log } from '@glass-frontier/utils';

import { completedSceneEvidence } from '../../scenes/boundaryEvidence';
import type { GraphContext } from '../../types';
import type { GraphNode, GraphNodeDelta } from './graphNode';

const MAX_OUTPUT_TOKENS = 4_000;

const buildPositionInput = async (
  context: GraphContext,
  thread: NarrativeThread,
  scenes: ActiveScene[]
): Promise<string> => [
  `THREAD TITLE: ${thread.title}`,
  `GOAL: ${thread.goal}`,
  `PRIOR POSITION: ${thread.position}`,
  ...await Promise.all(scenes.map((scene) => completedSceneEvidence(context, scene))),
].join('\n\n');

const requestPosition = async (
  context: GraphContext,
  thread: NarrativeThread,
  scenes: ActiveScene[],
  nodeId: string
): Promise<string> => {
  const playerId = context.chronicleState.chronicle.playerId;
  const model = await context.modelConfigStore.getModelForCategory('classification', playerId);
  const instructions = await context.templates.render('thread-position', {});
  const response = await context.llm.generate({
    input: [{
      content: [{ text: await buildPositionInput(context, thread, scenes), type: 'input_text' }],
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
    if (context.failure || !isNonEmptyString(context.gmResponse?.content)) {
      return {};
    }
    const threads = context.effectiveThreads.filter((thread) =>
      thread.perspective === 'player'
      && context.completedScenes.some((scene) => scene.threadId === thread.id)
    );
    const updates = await Promise.all(threads.map((thread) => this.#updateThread(context, thread)));
    return { threadPositionUpdates: updates.flat() };
  }

  async #updateThread(
    context: GraphContext,
    thread: NarrativeThread
  ): Promise<Array<{ position: string; threadId: string }>> {
    try {
      const scenes = context.completedScenes.filter((scene) => scene.threadId === thread.id);
      const position = await requestPosition(context, thread, scenes, this.id);
      return position.length === 0 ? [] : [{ position, threadId: thread.id }];
    } catch (error) {
      log('warn', 'gm.thread-position-failed', {
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        turnId: context.turnId,
      });
      return [];
    }
  }
}
