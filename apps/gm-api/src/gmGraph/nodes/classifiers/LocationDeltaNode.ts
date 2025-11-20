import {isNonEmptyString, log} from '@glass-frontier/utils';
import { z } from 'zod';

import type { GraphContext } from '../../../types';

import {LlmClassifierNode} from "@glass-frontier/gm-api/gmGraph/nodes/classifiers/LlmClassiferNode";

const LocationDeltaDecisionSchema = z.object({
  action: z
    .enum(['no_change', 'move'])
    .describe('Whether to stay put, move to a specific place.'),
  destination: z
    .string()
    .min(1)
    .describe('Name of the destination or best-known container.'),
  link: z
    .enum(['same', 'adjacent', 'inside', 'linked'])
    .describe('How the destination relates to the current anchor.'),
});

export type LocationDeltaDecision = z.infer<typeof LocationDeltaDecisionSchema>;

class LocationDeltaNode extends LlmClassifierNode<LocationDeltaDecision> {
  readonly id = 'location-delta';
  constructor() {
    super({
      id: 'location-delta',
      schema: LocationDeltaDecisionSchema,
      schemaName: 'location_delta_decision',
      applyResult: (context, result) => this.#saveLocationDelta(context, result),
      shouldRun: (context) => { return this.#isRunnable(context)},
      telemetryTag: 'location-delta'
    })
  }

  #isRunnable(context: GraphContext): boolean {
    const correctAction = (context.playerIntent?.intentType == 'action' || context.playerIntent?.intentType == 'planning' || context.playerIntent?.intentType === 'wrap')
    return (
      correctAction &&
      isNonEmptyString(context.gmResponse?.content) &&
      isNonEmptyString(context.chronicleState.chronicle.characterId)
    );
  }

  #saveLocationDelta(context: GraphContext, result: LocationDeltaDecision): GraphContext {
    return {
      ...context,
      locationDelta: result
    }
  }
}

export { LocationDeltaNode };