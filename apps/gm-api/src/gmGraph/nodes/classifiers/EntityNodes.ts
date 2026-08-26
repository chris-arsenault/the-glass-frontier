import { buildEntityContext } from '../../../entity/entitySelector';
import type { GraphContext } from '../../../types';
import type { GraphNode, GraphNodeDelta } from '../graphNode';

/**
 * Builds the candidate pool the player's reference resolver matches against.
 *
 * It no longer picks what the GM is allowed to know — the prose agent
 * discovers that for itself — and it no longer writes the roster, which is
 * derived after the turn from what the narration used.
 */
export class EntitySelectorNode implements GraphNode {
  readonly id = 'entity-selector';

  async execute(context: GraphContext): Promise<GraphNodeDelta> {
    if (context.failure) {
      return {};
    }
    return { entityContext: await buildEntityContext(context) };
  }
}
