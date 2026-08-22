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

export function resolveEffectiveScene(input: {
  activeScene: ChronicleScene | null;
  candidate: unknown;
  turnId: string;
  turnSequence: number;
}): { effectiveScene: ChronicleScene | null; sceneChange: SceneChange | null } {
  const sceneChange = normalizeSceneChange(input.candidate);
  if (sceneChange === null) {
    return { effectiveScene: input.activeScene, sceneChange: null };
  }
  if (
    input.activeScene !== null
    && input.activeScene.type === sceneChange.type
    && input.activeScene.subjectKind === sceneChange.subjectKind
    && sameSubject(input.activeScene.subject, sceneChange.subject)
  ) {
    return { effectiveScene: input.activeScene, sceneChange: null };
  }
  return {
    effectiveScene: {
      ...sceneChange,
      id: `scene:${input.turnId}`,
      startedAtTurn: input.turnSequence,
    },
    sceneChange,
  };
}

export function buildSceneContext(
  scene: ChronicleScene | null,
  outcome: SceneOutcome
): SceneContext | null {
  if (scene === null) {
    return null;
  }
  return {
    outcome,
    sceneId: scene.id,
    subject: scene.subject,
    subjectKind: scene.subjectKind,
    type: scene.type,
  };
}
