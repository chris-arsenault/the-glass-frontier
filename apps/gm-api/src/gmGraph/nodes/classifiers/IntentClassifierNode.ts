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

const beatDirectiveSchema = (beatIds: string[]): z.ZodType<{
  kind: 'existing' | 'independent' | 'new';
  summary: string;
  targetBeatId: string | null;
}> => {
  const targetBeatId = beatIds.length === 0
    ? z.null()
    : z.enum(beatIds as [string, ...string[]]).nullable();
  return z.object({
    kind: z
      .enum(['existing', 'new', 'independent'])
      .describe('Beat targeting: existing beat, new beat, or standalone turn.'),
    summary: z.string().min(1).describe('Brief rationale for the beat targeting (≤ 140 characters).'),
    targetBeatId: targetBeatId.describe(
      'The `id` of the targeted beat when kind="existing"; otherwise null.'
    ),
  });
};

const intentResponseSchema = (context: GraphContext): z.ZodType<IntentResponse> =>
  z.object({
    beatDirective: beatDirectiveSchema(
      context.chronicleState.chronicle.beats
        .filter((beat) => beat.status === 'in_progress')
        .map((beat) => beat.id)
    ),
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
    sceneRationale: z
      .string()
      .min(1)
      .describe(
        'Why this turn opens, continues, or stays out of a typed scene — name the '
        + 'scene type you considered and what decided it (≤ 140 characters).'
      ),
    tone: z.string().min(1).describe('Narrative tone adjective grounded in the current scene.'),
  });

type IntentResponse = {
  beatDirective: { kind: 'existing' | 'independent' | 'new'; summary: string; targetBeatId: string | null };
  creativeSpark: boolean;
  handlerHints: string[];
  intentSummary: string;
  intentType: Intent['intentType'];
  routerRationale: string;
  sceneChange: z.infer<typeof SceneChangeCandidate> | null;
  sceneRationale: string;
  tone: string;
};
const NODE_ID = 'intent-classifier';

/**
 * Logged every turn, including the turns that stay out of a typed scene — a
 * chronicle that never reaches a battle or dialog scene is exactly the case
 * that used to leave no trace, and `rationale` is the classifier's own account
 * of why.
 */
const logSceneLifecycle = (input: {
  candidate: unknown;
  context: GraphContext;
  effectiveScene: ChronicleScene | null;
  rationale: string;
  replacedSceneId: string | null;
  transition: SceneTransition;
}): void => {
  const { candidate, context, effectiveScene, rationale, replacedSceneId, transition } = input;
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
    rationale,
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
      schema: (context) => intentResponseSchema(context),
      schemaName: 'intent_response_schema',
      shouldRun: () => true,
      telemetryTag: `llm.${NODE_ID}`
    });
  }

  #applyIntent(context: GraphContext, result: IntentResponse): GraphNodeDelta {
    const { effectiveScene, replacedSceneId, sceneChange, transition } = resolveEffectiveScene({
      activeScene: context.chronicleState.chronicle.activeScene,
      candidate: result.sceneChange,
      locationName: context.chronicleState.locationName,
      turnId: context.turnId,
      turnSequence: context.turnSequence,
    });
    logSceneLifecycle({
      candidate: result.sceneChange,
      context,
      effectiveScene,
      rationale: result.sceneRationale,
      replacedSceneId,
      transition,
    });
    const intent: Intent = {
      beatDirective: result.beatDirective,
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
      sceneRationale: result.sceneRationale,
      tone: result.tone,
    };
    return { effectiveScene, playerIntent: intent };
  }
}

export { IntentClassifierNode };
