import {
  SCENE_CLOCK_TARGET,
  SceneChange,
  type ChronicleScene,
  type OutcomeTier,
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
  locationName: string;
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
      location: input.locationName,
      progress: 0,
      progressTarget: SCENE_CLOCK_TARGET,
      startedAtTurn: input.turnSequence,
    },
    replacedSceneId: input.activeScene?.id ?? null,
    sceneChange,
    transition: input.activeScene === null ? 'started' : 'replaced',
  };
}

const CLOCK_STEPS = new Map<OutcomeTier, number>([
  ['advance', 1],
  ['breakthrough', 2],
  ['collapse', -2],
  ['regress', -1],
  ['stall', 0],
]);

/**
 * Moves the scene clock by a check's outcome, clamped to [0, target]. The
 * clock is the encounter's shared sense of how close it is to resolving:
 * both the player and the completion judge see the same number.
 */
export function advanceSceneClock(
  scene: ChronicleScene,
  outcomeTier: OutcomeTier | undefined
): ChronicleScene {
  if (outcomeTier === undefined) {
    return scene;
  }
  const target = scene.progressTarget ?? SCENE_CLOCK_TARGET;
  const step = CLOCK_STEPS.get(outcomeTier) ?? 0;
  const next = Math.max(0, Math.min(target, (scene.progress ?? 0) + step));
  return next === scene.progress ? scene : { ...scene, progress: next };
}

export const isSceneClockFull = (scene: ChronicleScene): boolean =>
  (scene.progress ?? 0) >= (scene.progressTarget ?? SCENE_CLOCK_TARGET);

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
    ...(outcome !== 'continue' && outcomeReason !== null
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
