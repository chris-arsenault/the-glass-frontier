import {
  type IntentType,
  type LocationDeltaDecision,
  LocationDeltaDecision as LocationDeltaDecisionSchema,
} from '@glass-frontier/dto';
import { LlmClassifierNode } from '@glass-frontier/gm-api/gmGraph/nodes/classifiers/LlmClassiferNode';
import { isNonEmptyString } from '@glass-frontier/utils';

import type { GraphContext } from '../../../types';
import type { GraphNodeDelta } from '../graphNode';

const NODE_ID = 'location-delta';
const RUNNABLE_INTENTS = new Set<IntentType>(['action', 'planning', 'wrap']);

class LocationDeltaNode extends LlmClassifierNode<LocationDeltaDecision> {
  readonly id = NODE_ID;
  constructor() {
    super({
      applyResult: (context, result) => this.#saveLocationDelta(context, result),
      id: NODE_ID,
      schema: LocationDeltaDecisionSchema,
      schemaName: 'location_delta_decision',
      shouldRun: (context) => this.#isRunnable(context),
      telemetryTag: NODE_ID
    });
  }

  #isRunnable(context: GraphContext): boolean {
    const intentType = context.playerIntent?.intentType;
    return (
      intentType !== undefined
      && RUNNABLE_INTENTS.has(intentType)
      && isNonEmptyString(context.gmResponse?.content)
      && isNonEmptyString(context.chronicleState.chronicle.characterId)
    );
  }

  #saveLocationDelta(_context: GraphContext, result: LocationDeltaDecision): GraphNodeDelta {
    return { locationDelta: result };
  }
}

export { LocationDeltaNode };
export type { LocationDeltaDecision } from '@glass-frontier/dto';
