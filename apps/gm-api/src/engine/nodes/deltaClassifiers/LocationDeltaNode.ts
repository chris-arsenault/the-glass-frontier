import { LocationContextSchema } from '@glass-frontier/worldstate';
import type { LocationContext, LocationDelta } from '@glass-frontier/worldstate';
import { z } from 'zod';

import { composeLocationDeltaPrompt } from '../../prompts';
import { LlmClassifierNode } from '../classifiers/LlmClassifierNode';
import type { StructuredLlmClient } from '../structuredLlmClient';
import { deriveLocationContext } from './locationHelpers';

const LocationDeltaDecisionSchema = z.object({
  action: z.enum(['stay', 'move', 'uncertain']).default('stay'),
  after: LocationContextSchema.partial().optional(),
  notes: z.string().optional(),
});

type LocationDeltaDecision = z.infer<typeof LocationDeltaDecisionSchema>;

export class LocationDeltaNode extends LlmClassifierNode<LocationDeltaDecision> {
  constructor(client: StructuredLlmClient) {
    super(client, {
      applyResult: (context, result) => {
        const before =
          context.turnDraft.locationContext ?? deriveLocationContext(context.character?.locationState);
        const after = this.#buildAfterContext(result, before);
        const delta = this.#buildDelta(before, after, result);

        return {
          ...context,
          effects: {
            ...context.effects,
            location: {
              delta,
              locationContext: after ?? before,
            },
          },
          locationSummary: context.locationSummary,
          turnDraft: {
            ...context.turnDraft,
            locationContext: after ?? before,
            locationDelta: delta,
          },
        };
      },
      buildPrompt: (context) =>
        composeLocationDeltaPrompt({
          character: context.character,
          chronicle: context.chronicle,
          currentSummary: context.locationSummary ?? null,
          gmMessage: context.turnDraft.gmMessage?.content ?? '',
          intentSummary: context.turnDraft.playerIntent?.summary,
        }),
      id: 'location-delta',
      schema: LocationDeltaDecisionSchema,
      telemetryTag: 'llm.location-delta',
    });
  }

  #buildAfterContext(
    result: LocationDeltaDecision,
    before?: LocationContext
  ): LocationContext | undefined {
    if (result.action !== 'move') {
      return before;
    }
    const normalized = this.#normalizeContext(result.after);
    if (normalized === undefined) {
      return before;
    }
    return {
      breadcrumb: before?.breadcrumb ?? [],
      certainty: normalized.certainty ?? 1,
      locationId: normalized.locationId,
      placeId: normalized.placeId,
      placeName: normalized.placeName ?? before?.placeName ?? 'Unknown',
    };
  }

  #normalizeContext(
    after?: Partial<LocationContext>
  ): (Pick<LocationContext, 'locationId' | 'placeId'> &
    Partial<Omit<LocationContext, 'locationId' | 'placeId'>>) | undefined {
    if (
      after === undefined ||
      after === null ||
      typeof after.locationId !== 'string' ||
      after.locationId.length === 0 ||
      typeof after.placeId !== 'string' ||
      after.placeId.length === 0
    ) {
      return undefined;
    }
    return {
      certainty: typeof after.certainty === 'number' ? after.certainty : undefined,
      locationId: after.locationId,
      placeId: after.placeId,
      placeName: typeof after.placeName === 'string' ? after.placeName : undefined,
    };
  }

  #buildDelta(
    before?: LocationContext,
    after?: LocationContext,
    result?: LocationDeltaDecision
  ): LocationDelta | undefined {
    if (before === undefined && after === undefined) {
      return undefined;
    }
    if (result?.action === 'stay' || result?.action === 'uncertain') {
      return undefined;
    }
    return {
      after,
      before,
    };
  }
}
