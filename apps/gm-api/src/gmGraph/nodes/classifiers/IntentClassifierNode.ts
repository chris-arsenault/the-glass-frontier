import {
  type Intent,
  IntentType,
  SceneDirective,
  ThreadFocusDirective,
} from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import { z } from 'zod';

import { projectScene } from '../../../scenes/boundedScene';
import { projectThreadFocus } from '../../../threads/threadFocus';
import type { GraphContext } from '../../../types';
import type { GraphNodeDelta } from '../graphNode';
import { LlmClassifierNode } from './LlmClassiferNode';

const intentResponseSchema = z.object({
  creativeSpark: z.boolean().describe(
    'True only when the move uses genuine improvisation beyond the obvious approach.'
  ),
  intentSummary: z.string().min(1).max(450)
    .describe('Concise paraphrase retaining every distinct thing the player asked for.'),
  intentType: IntentType,
  scene: SceneDirective,
  thread: ThreadFocusDirective,
});

type IntentResponse = z.infer<typeof intentResponseSchema>;
const NODE_ID = 'intent-classifier';

class IntentClassifierNode extends LlmClassifierNode<IntentResponse> {
  readonly id = NODE_ID;

  constructor() {
    super({
      applyResult: (context, result) => this.#applyIntent(context, result),
      id: NODE_ID,
      schema: intentResponseSchema,
      schemaName: 'intent_response_schema',
      shouldRun: () => true,
      telemetryTag: `llm.${NODE_ID}`,
    });
  }

  #applyIntent(context: GraphContext, result: IntentResponse): GraphNodeDelta {
    const threadProjection = projectThreadFocus({
      characterName: context.chronicleState.character.name,
      directive: result.thread,
      focusedThreadId: context.chronicleState.chronicle.focusedThreadId,
      threads: context.chronicleState.chronicle.threads,
      turnSequence: context.turnSequence,
    });
    const sceneProjection = projectScene({
      activeScene: context.chronicleState.chronicle.activeScene,
      directive: result.scene,
      focusedThreadId: threadProjection.focusedThreadId,
      intentType: result.intentType,
      turnId: context.turnId,
    });
    const intent: Intent = {
      creativeSpark: result.creativeSpark,
      intentSummary: result.intentSummary,
      intentType: result.intentType,
      metadata: {
        tags: ['source:intent-classifier'],
        timestamp: Date.now(),
      },
      scene: result.scene,
      thread: result.thread,
    };
    log('info', 'gm.scene-projection', {
      boundary: sceneProjection.boundary,
      chronicleId: context.chronicleId,
      directive: result.scene.action,
      question: sceneProjection.effectiveScene?.question ?? '',
      turnsRemaining: sceneProjection.effectiveScene?.turnsRemaining ?? -1,
      type: sceneProjection.effectiveScene?.type ?? '',
      willClose: sceneProjection.willClose,
    });
    return {
      effectiveFocusedThreadId: threadProjection.focusedThreadId,
      effectiveScene: sceneProjection.effectiveScene,
      effectiveThreads: threadProjection.threads,
      playerIntent: intent,
      sceneBoundary: sceneProjection.boundary,
      sceneWillClose: sceneProjection.willClose,
    };
  }
}

export { IntentClassifierNode };
