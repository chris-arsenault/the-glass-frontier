import type {
  ChronicleScene,
  HardState,
  Intent,
  SceneChange,
} from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
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

/** The winning candidate, or the reason the gate refused every candidate. */
const acceptedCandidate = (
  candidates: SubjectEntityCandidate[]
): { candidate?: SubjectEntityCandidate; outcome: string } => {
  const best = candidates[0];
  const runnerUp = candidates[1];
  if (best === undefined) {
    return { outcome: 'no_candidates' };
  }
  if (best.similarity < MIN_SIMILARITY) {
    return { outcome: `below_similarity: ${best.name} at ${best.similarity.toFixed(3)}` };
  }
  if (runnerUp !== undefined && best.score - runnerUp.score < MIN_SCORE_MARGIN) {
    return {
      outcome: `margin_too_small: ${best.name} vs ${runnerUp.name}, delta ${(best.score - runnerUp.score).toFixed(3)}`,
    };
  }
  return {
    candidate: best,
    outcome: `vector_match: ${best.name} similarity ${best.similarity.toFixed(3)}`,
  };
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
      this.#logResolution(context, state.sceneChange, `exact_match: ${exact.slug}`);
      return withSubjectEntity(state, exact.id);
    }
    if (!await context.worldSchemaStore.hasEntityEmbeddings(state.sceneChange.subjectKind)) {
      this.#logResolution(context, state.sceneChange, 'no_embeddings_for_kind');
      return {};
    }

    try {
      const { candidate, outcome } = await this.#resolveVectorCandidate(
        context,
        state.sceneChange
      );
      this.#logResolution(context, state.sceneChange, outcome);
      return candidate === undefined ? {} : withSubjectEntity(state, candidate.id);
    } catch (error: unknown) {
      this.#recordFailure(context, error);
      return {};
    }
  }

  #logResolution(context: GraphContext, sceneChange: SceneChange, outcome: string): void {
    log('info', 'gm.scene-subject-resolution', {
      chronicleId: context.chronicleId,
      outcome,
      subject: sceneChange.subject,
      subjectKind: sceneChange.subjectKind,
      turnSequence: context.turnSequence,
    });
  }

  async #resolveVectorCandidate(
    context: GraphContext,
    sceneChange: SceneChange
  ): Promise<{ candidate?: SubjectEntityCandidate; outcome: string }> {
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
