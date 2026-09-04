import {
  type ActiveScene,
  type IntentType,
  SCENE_TURN_LIMIT,
  type SceneDirective,
} from '@glass-frontier/dto';

const CONSEQUENTIAL_INTENTS = new Set<IntentType>(['action', 'planning', 'wrap']);

export const isConsequentialIntent = (intentType: IntentType): boolean =>
  CONSEQUENTIAL_INTENTS.has(intentType);

export type SceneProjection = {
  boundary: boolean;
  effectiveScene: ActiveScene | null;
  willClose: boolean;
};

type ProjectionInput = {
  activeScene: ActiveScene | null;
  directive: SceneDirective;
  focusedThreadId: string | null;
  intentType: IntentType;
  turnId: string;
};

const leaveScene = (activeScene: ActiveScene | null): SceneProjection => ({
  boundary: activeScene !== null,
  effectiveScene: activeScene === null ? null : { ...activeScene, turnsRemaining: 0 },
  willClose: activeScene !== null,
});

const openScene = (input: ProjectionInput, consequential: boolean): SceneProjection => {
  if (input.directive.action !== 'open') {
    throw new Error('openScene requires an open directive');
  }
  const scene: ActiveScene = {
    id: input.turnId,
    question: input.directive.question.trim(),
    threadId: input.focusedThreadId,
    turnsRemaining: consequential ? SCENE_TURN_LIMIT - 1 : SCENE_TURN_LIMIT,
    type: input.directive.type,
  };
  return {
    boundary: input.activeScene !== null,
    effectiveScene: scene,
    willClose: scene.turnsRemaining === 0,
  };
};

const continueScene = (
  activeScene: ActiveScene | null,
  consequential: boolean
): SceneProjection => {
  if (activeScene === null || !consequential) {
    return { boundary: false, effectiveScene: activeScene, willClose: false };
  }
  const effectiveScene = {
    ...activeScene,
    turnsRemaining: Math.max(0, activeScene.turnsRemaining - 1),
  };
  return {
    boundary: effectiveScene.turnsRemaining === 0,
    effectiveScene,
    willClose: effectiveScene.turnsRemaining === 0,
  };
};

/** Projects the one scene transition the current player message establishes. */
export const projectScene = (input: ProjectionInput): SceneProjection => {
  const consequential = isConsequentialIntent(input.intentType);

  if (input.directive.action === 'leave') {
    return leaveScene(input.activeScene);
  }

  if (input.directive.action === 'open') {
    return openScene(input, consequential);
  }

  return continueScene(input.activeScene, consequential);
};
