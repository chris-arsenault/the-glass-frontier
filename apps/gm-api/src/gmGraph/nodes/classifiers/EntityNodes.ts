import { buildEntityContext } from '../../../entity/entitySelector';
import type { GraphContext } from '../../../types';
import type { GraphNode, GraphNodeDelta } from '../graphNode';

/**
 * Builds the turn's entity context: the candidate pool the player reference
 * resolver matches against, and the roster the client shows.
 *
 * It no longer picks what the GM is allowed to know. The prose agent
 * discovers that for itself, so the judge that used to score this node's
 * offered list against the finished narration is gone.
 */
export class EntitySelectorNode implements GraphNode {
  readonly id = 'entity-selector';

  async execute(context: GraphContext): Promise<GraphNodeDelta> {
    if (context.failure) {
      return {};
    }
    const entityContext = await buildEntityContext(context);
    return {
      chronicleState: {
        ...context.chronicleState,
        chronicle: {
          ...context.chronicleState.chronicle,
          entityRoster: {
            entries: entityContext.roster,
            locationName: context.chronicleState.locationName,
            sceneId: context.effectiveScene?.id ?? null,
            updatedAtTurn: context.turnSequence,
          },
        },
      },
      entityContext,
      turnEntityRoster: entityContext.roster,
    };
  }
}
