import type {
  ChronicleScene,
  HardState,
  Intent,
  SceneChange,
} from '@glass-frontier/dto';
import type { SubjectEntityCandidate } from '@glass-frontier/worldstate';

import type { GraphContext } from '../../types';
import type { GraphNode, GraphNodeDelta } from './graphNode';

const FOCUS_ENTITY_COUNT = 3;
const MIN_SCORE_MARGIN = 0.04;
const MIN_SIMILARITY = 0.6;

type SubjectResolutionState = {
  effectiveScene: ChronicleScene;
  playerIntent: Intent;
  sceneChange: SceneChange;
};

const topFocusedEntities = (context: GraphContext): string[] =>
  Object.entries(context.chronicleState.chronicle.entityFocus?.entityScores ?? {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, FOCUS_ENTITY_COUNT)
    .map(([id]) => id);

const withSubjectEntity = (
  state: SubjectResolutionState,
  subjectEntityId: string
): GraphNodeDelta => {
  const resolvedChange = { ...state.sceneChange, subjectEntityId };
  return {
    effectiveScene: { ...state.effectiveScene, subjectEntityId },
    playerIntent: {
      ...state.playerIntent,
      sceneChange: resolvedChange,
    },
  };
};

const resolutionState = (context: GraphContext): SubjectResolutionState | null => {
  const playerIntent = context.playerIntent;
  const sceneChange = playerIntent?.sceneChange;
  const effectiveScene = context.effectiveScene;
  if (
    context.failure
    || playerIntent === undefined
    || sceneChange === null
    || sceneChange === undefined
    || effectiveScene === null
    || sceneChange.subjectEntityId !== undefined
  ) {
    return null;
  }
  return { effectiveScene, playerIntent, sceneChange };
};

const uniqueKindMatch = (
  entities: HardState[],
  kind: HardState['kind']
): HardState | undefined => {
  const matches = entities.filter((entity) => entity.kind === kind);
  return matches.length === 1 ? matches[0] : undefined;
};

const acceptedCandidate = (
  candidates: SubjectEntityCandidate[]
): SubjectEntityCandidate | undefined => {
  const best = candidates[0];
  const runnerUp = candidates[1];
  if (
    best === undefined
    || best.similarity < MIN_SIMILARITY
    || (runnerUp !== undefined && best.score - runnerUp.score < MIN_SCORE_MARGIN)
  ) {
    return undefined;
  }
  return best;
};

export class SceneSubjectResolverNode implements GraphNode {
  readonly id = 'scene-subject-resolver';

  async execute(context: GraphContext): Promise<GraphNodeDelta> {
    const state = resolutionState(context);
    if (state === null) {
      return {};
    }

    const exact = uniqueKindMatch(
      await context.worldSchemaStore.findEntitiesByName({ name: state.sceneChange.subject }),
      state.sceneChange.subjectKind
    );
    if (exact !== undefined) {
      return withSubjectEntity(state, exact.id);
    }
    if (!await context.worldSchemaStore.hasEntityEmbeddings(state.sceneChange.subjectKind)) {
      return {};
    }

    try {
      const candidate = await this.#resolveVectorCandidate(context, state.sceneChange);
      return candidate === undefined ? {} : withSubjectEntity(state, candidate.id);
    } catch (error: unknown) {
      this.#recordFailure(context, error);
      return {};
    }
  }

  async #resolveVectorCandidate(
    context: GraphContext,
    sceneChange: SceneChange
  ): Promise<SubjectEntityCandidate | undefined> {
    const location = await context.worldSchemaStore.findLocationByName({
      name: context.chronicleState.locationName,
    });
    const anchorEntityId = context.chronicleState.chronicle.anchorEntityId;
    const focusIds = [
      ...new Set([
        ...(anchorEntityId === undefined ? [] : [anchorEntityId]),
        ...(location === null ? [] : [location.id]),
        ...topFocusedEntities(context),
      ]),
    ];
    const embedding = await context.embeddings.embed(
      `${sceneChange.subject}\nkind: ${sceneChange.subjectKind}`
    );
    return acceptedCandidate(await context.worldSchemaStore.findSubjectCandidates({
      embedding,
      focusIds,
      kind: sceneChange.subjectKind,
      limit: 3,
    }));
  }

  #recordFailure(context: GraphContext, error: unknown): void {
    context.telemetry.recordToolError({
      attempt: 0,
      chronicleId: context.chronicleId,
      message: error instanceof Error ? error.message : String(error),
      operation: this.id,
    });
  }
}
