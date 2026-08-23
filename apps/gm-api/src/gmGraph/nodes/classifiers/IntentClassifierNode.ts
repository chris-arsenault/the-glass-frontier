import {
  type ChronicleScene,
  type Intent,
  IntentType,
  SceneChangeCandidate,
} from '@glass-frontier/dto';
import type { GraphContext } from '@glass-frontier/gm-api/types';
import { log } from '@glass-frontier/utils';
import { z } from 'zod';

import { resolveEffectiveScene, type SceneTransition } from '../../../scenes/sceneLifecycle';
import type { GraphNodeDelta } from '../graphNode';
import { LlmClassifierNode } from './LlmClassiferNode';

const IntentResponseSchema = z.object({
  creativeSpark: z
    .boolean()
    .describe('True when the player intent expresses improvisational or imaginative action.'),
  handlerHints: z
    .array(
      z
        .string()
        .min(1)
        .describe('Lowercase hint that nudges downstream narration (e.g., "whispered").')
    )
    .max(8)
    .describe('Ordered list of handler hints; emit an empty array when none apply.'),
  intentSummary: z
    .string()
    .min(1)
    .describe('Concise paraphrase of the player’s request (≤ 140 characters).'),
  intentType: IntentType.describe('One of the canonical Glass Frontier intent types.'),
  routerRationale: z
    .string()
    .min(1)
    .describe('Single sentence explaining why the classification was chosen.'),
  sceneChange: SceneChangeCandidate.nullable()
    .default(null)
    .describe('New typed scene when play enters or switches scene; null to continue current context.'),
  tone: z.string().min(1).describe('Narrative tone adjective grounded in the current scene.'),
});

type IntentResponse = z.infer<typeof IntentResponseSchema>;
const NODE_ID = 'intent-classifier';

const logSceneLifecycle = (input: {
  candidate: unknown;
  context: GraphContext;
  effectiveScene: ChronicleScene | null;
  replacedSceneId: string | null;
  transition: SceneTransition;
}): void => {
  const { candidate, context, effectiveScene, replacedSceneId, transition } = input;
  if (transition === 'none') {
    return;
  }
  const scene = effectiveScene === null
    ? { sceneId: '', subject: '', subjectKind: '', type: '' }
    : {
      sceneId: effectiveScene.id,
      subject: effectiveScene.subject,
      subjectKind: effectiveScene.subjectKind,
      type: effectiveScene.type,
    };
  const level = transition === 'parse_failed' ? 'warn' : 'info';
  log(level, 'gm.scene-lifecycle', {
    ...scene,
    candidate: level === 'warn' ? JSON.stringify(candidate) : '',
    chronicleId: context.chronicleId,
    replacedSceneId: replacedSceneId === null ? '' : replacedSceneId,
    transition,
    turnSequence: context.turnSequence,
  });
};

class IntentClassifierNode extends LlmClassifierNode<IntentResponse> {
  readonly id = NODE_ID;
  constructor() {
    super({
      applyResult: (context, result) => this.#applyIntent(context, result),
      id: NODE_ID,
      schema: IntentResponseSchema,
      schemaName: 'intent_response_schema',
      shouldRun: () => true,
      telemetryTag: `llm.${NODE_ID}`
    });
  }

  #applyIntent(context: GraphContext, result: IntentResponse): GraphNodeDelta {
    const { effectiveScene, replacedSceneId, sceneChange, transition } = resolveEffectiveScene({
      activeScene: context.chronicleState.chronicle.activeScene,
      candidate: result.sceneChange,
      turnId: context.turnId,
      turnSequence: context.turnSequence,
    });
    logSceneLifecycle({
      candidate: result.sceneChange,
      context,
      effectiveScene,
      replacedSceneId,
      transition,
    });
    const intent: Intent = {
      beatDirective: {
        kind: 'independent',
        summary: 'No beat directive assigned.',
        targetBeatId: null
      },
      creativeSpark: result.creativeSpark,
      handlerHints: result.handlerHints,
      intentSummary: result.intentSummary,
      intentType: result.intentType,
      metadata: {
        tags: ['source:intent-classifier'],
        timestamp: Date.now(),
      },
      routerRationale: result.routerRationale,
      sceneChange,
      tone: result.tone,
    };
    return { effectiveScene, playerIntent: intent };
  }
}

export { IntentClassifierNode };
