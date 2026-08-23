import {
  SceneChange,
  type ChronicleScene,
  type SceneContext,
  type SceneOutcome,
} from '@glass-frontier/dto';

const sameSubject = (left: string, right: string): boolean =>
  left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();

export function normalizeSceneChange(candidate: unknown): SceneChange | null {
  const parsed = SceneChange.safeParse(candidate);
  if (!parsed.success) {
    return null;
  }
  return {
    ...parsed.data,
    subject: parsed.data.subject.trim(),
  };
}

/**
 * What resolveEffectiveScene decided, for diagnostics: `none` (no candidate),
 * `parse_failed` (candidate present but malformed), `continuation` (same scene
 * repeated), `started` (new scene, nothing active), `replaced` (new scene
 * displaced the active one).
 */
export type SceneTransition = 'continuation' | 'none' | 'parse_failed' | 'replaced' | 'started';

const missingCandidateTransition = (candidate: unknown): SceneTransition =>
  candidate === null || candidate === undefined ? 'none' : 'parse_failed';

export function resolveEffectiveScene(input: {
  activeScene: ChronicleScene | null;
  candidate: unknown;
  turnId: string;
  turnSequence: number;
}): {
  effectiveScene: ChronicleScene | null;
  replacedSceneId: string | null;
  sceneChange: SceneChange | null;
  transition: SceneTransition;
} {
  const sceneChange = normalizeSceneChange(input.candidate);
  if (sceneChange === null) {
    return {
      effectiveScene: input.activeScene,
      replacedSceneId: null,
      sceneChange: null,
      transition: missingCandidateTransition(input.candidate),
    };
  }
  if (
    input.activeScene !== null
    && input.activeScene.type === sceneChange.type
    && input.activeScene.subjectKind === sceneChange.subjectKind
    && sameSubject(input.activeScene.subject, sceneChange.subject)
  ) {
    return {
      effectiveScene: input.activeScene,
      replacedSceneId: null,
      sceneChange: null,
      transition: 'continuation',
    };
  }
  return {
    effectiveScene: {
      ...sceneChange,
      id: `scene:${input.turnId}`,
      startedAtTurn: input.turnSequence,
    },
    replacedSceneId: input.activeScene?.id ?? null,
    sceneChange,
    transition: input.activeScene === null ? 'started' : 'replaced',
  };
}

export function buildSceneContext(
  scene: ChronicleScene | null,
  outcome: SceneOutcome,
  outcomeReason: string | null = null
): SceneContext | null {
  if (scene === null) {
    return null;
  }
  return {
    outcome,
    ...(outcome === 'complete' && outcomeReason !== null
      ? { outcomeReason }
      : {}),
    sceneId: scene.id,
    subject: scene.subject,
    ...(scene.subjectEntityId === undefined
      ? {}
      : { subjectEntityId: scene.subjectEntityId }),
    subjectKind: scene.subjectKind,
    type: scene.type,
  };
}
