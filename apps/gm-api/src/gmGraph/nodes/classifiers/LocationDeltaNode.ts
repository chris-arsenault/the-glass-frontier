import {
  type IntentType,
  type LocationDeltaDecision,
  LocationDeltaDecision as LocationDeltaDecisionSchema,
} from '@glass-frontier/dto';
import { isNonEmptyString } from '@glass-frontier/utils';

import type { GraphNodeDelta } from '../graphNode';
import { LlmClassifierNode } from './LlmClassiferNode';

const NODE_ID = 'location-delta';
const RUNNABLE_INTENTS = new Set<IntentType>(['action', 'planning', 'wrap']);

export class LocationDeltaNode extends LlmClassifierNode<LocationDeltaDecision> {
  readonly id = NODE_ID;

  constructor() {
    super({
      applyResult: (_context, result): GraphNodeDelta => ({ locationDelta: result }),
      failureMode: 'advisory',
      id: NODE_ID,
      schema: LocationDeltaDecisionSchema,
      schemaName: 'location_delta_response',
      shouldRun: (context) => {
        const intentType = context.playerIntent?.intentType;
        return intentType !== undefined
          && RUNNABLE_INTENTS.has(intentType)
          && isNonEmptyString(context.gmResponse?.content);
      },
    });
  }
}
