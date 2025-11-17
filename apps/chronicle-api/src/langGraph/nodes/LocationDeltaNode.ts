import { randomUUID } from 'node:crypto';

import type {
  LocationBreadcrumbEntry,
  LocationContext,
  LocationDelta,
  LocationEdgeKind,
  LocationPlace,
  LocationSummary,
  WorldStateStoreV2,
} from '@glass-frontier/worldstate';
import { log } from '@glass-frontier/utils';
import { zodTextFormat } from 'openai/helpers/zod';
import { z, type ZodType } from 'zod';

import type { GraphContext, LangGraphLlmLike } from '../../types';
import { deriveLocationContextFromState } from '../../locationContext';
import type { GraphNode } from '../orchestrator';
import { composeLocationDeltaPrompt } from '../prompts/prompts';
import {
  type DecisionResolution,
  type DeltaDecision,
  type PlannerContext,
  type NeighborRef,
  buildPlannerContext,
  buildPromptInput,
  resolveDecision,
} from './locationDeltaPlanner';

type Decision = DeltaDecision;

const decisionSchema: ZodType<DeltaDecision> = z.object({
  action: z
    .enum(['no_change', 'move', 'uncertain'])
    .describe('Whether to stay put, move to a specific place, or flag uncertainty.'),
  destination: z
    .string()
    .min(1)
    .describe('Name of the destination or best-known container.'),
  link: z
    .enum(['same', 'adjacent', 'inside', 'linked'])
    .describe('How the destination relates to the current anchor.'),
});

const LOCATION_DECISION_FORMAT = zodTextFormat(decisionSchema, 'location_delta_decision');
const LOCATION_DECISION_TEXT = {
  format: LOCATION_DECISION_FORMAT,
  verbosity: 'low' as const,
};
const CLASSIFIER_MODEL = 'gpt-5-nano';
const CLASSIFIER_REASONING = { reasoning: { effort: 'minimal' as const } };

const resolveClassifierLlm = (context: GraphContext): LangGraphLlmLike =>
  context.llmResolver?.(CLASSIFIER_MODEL) ?? context.llm;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export class LocationDeltaNode implements GraphNode {
  readonly id = 'location-delta';
  readonly #worldStateStore: WorldStateStoreV2;

  constructor(worldStateStore: WorldStateStoreV2) {
    this.#worldStateStore = worldStateStore;
  }

  async execute(context: GraphContext): Promise<GraphContext> {
    const gmMessageContent = context.gmMessage?.content;
    const characterId = context.chronicle.character?.id;
    if (!this.#isRunnable(context, gmMessageContent, characterId)) {
      return context;
    }

    try {
      const plannerContext = await this.#resolvePlannerContext(context);
      if (plannerContext === null) {
        return context;
      }
      const promptInput = buildPromptInput(
        plannerContext,
        context.gmMessage?.content ?? '',
        context.playerMessage?.content ?? ''
      );
      const prompt = await composeLocationDeltaPrompt(context.templates, promptInput);
      const decision = await this.#requestDecision(context, plannerContext.currentPlaceId, prompt);
      if (decision === null) {
        return context;
      }
      const resolution = resolveDecision(plannerContext, decision);
      return await this.#applyResolution(context, plannerContext, resolution);
    } catch (error) {
      log('warn', 'location-delta-node.failed', {
        chronicleId: context.chronicleId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return context;
    }
  }

  async #resolvePlannerContext(context: GraphContext): Promise<PlannerContext | null> {
    return buildPlannerContext({
      store: this.#worldStateStore,
      character: context.chronicle.character ?? null,
      locationSummary: context.chronicle.location ?? null,
      locationId: context.chronicle.chronicle.locationId,
    });
  }

  async #requestDecision(
    context: GraphContext,
    locationId: string,
    prompt: string
  ): Promise<Decision | null> {
    const classifier = resolveClassifierLlm(context);
    try {
      const llmResult = await classifier.generateJson({
        maxTokens: 400,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        reasoning: CLASSIFIER_REASONING.reasoning,
        temperature: 0.1,
        text: LOCATION_DECISION_TEXT,
      });
      const parsed = decisionSchema.safeParse(llmResult.json);
      if (!parsed.success) {
        log('warn', 'location-delta-node.invalid-json', {
          chronicleId: context.chronicleId,
          locationId,
          payload: llmResult.json,
          reason: 'schema_parse_failed',
        });
        return null;
      }
      return parsed.data;
    } catch (error) {
      log('warn', 'location-delta-node.invalid-json', {
        chronicleId: context.chronicleId,
        locationId,
        payload: 'structured_output_failure',
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return null;
    }
  }

  async #applyResolution(
    context: GraphContext,
    planner: PlannerContext,
    resolution: DecisionResolution
  ): Promise<GraphContext> {
    const beforeContext =
      context.locationContext ??
      deriveLocationContextFromState(
        context.chronicle.character?.locationState ?? null,
        context.chronicle.location ?? null
      );
    switch (resolution.kind) {
    case 'noop':
      return {
        ...context,
        locationContext: beforeContext ?? context.locationContext ?? null,
        locationDelta: null,
      };
    case 'uncertain':
      return {
        ...context,
        locationPlan: null,
        locationContext: beforeContext ?? context.locationContext ?? null,
        locationDelta: null,
      };
    case 'create':
      return this.#createAndMove(context, planner, resolution, beforeContext ?? null);
    case 'move':
      return this.#applyMove(context, planner, resolution, beforeContext ?? null);
    default:
      return context;
    }
  }

  async #createAndMove(
    context: GraphContext,
    planner: PlannerContext,
    resolution: Extract<DecisionResolution, { kind: 'create' }>,
    beforeContext: LocationContext | null
  ): Promise<GraphContext> {
    const relationKind = mapLinkToRelationKind(resolution.link);
    if (!relationKind) {
      log('warn', 'location-delta-node.unknown-link', {
        chronicleId: context.chronicleId,
        link: resolution.link,
      });
      return { ...context, locationPlan: null };
    }
    const currentEntry = planner.currentBreadcrumb.at(-1) ?? null;
    const fallbackEntry: LocationBreadcrumbEntry = {
      id: planner.currentPlaceId,
      kind: currentEntry?.kind ?? DEFAULT_PLACE_KIND,
      name: planner.currentName,
    };
    const sourcePlace = toLocationPlace(currentEntry ?? fallbackEntry);
    const newPlace: LocationPlace = {
      id: randomUUID(),
      name: resolution.destination,
      kind: DEFAULT_PLACE_KIND,
      description: undefined,
      tags: [],
    };
    await this.#worldStateStore.addLocationNeighborEdge({
      locationId: planner.locationId,
      src: sourcePlace,
      dst: newPlace,
      relationKind,
    });
    const breadcrumb = buildBreadcrumbForRelation(planner.currentBreadcrumb, relationKind, newPlace);
    const target = {
      placeId: newPlace.id,
      name: newPlace.name,
      breadcrumb,
    } as const;
    return this.#applyMove(context, planner, { kind: 'move', target }, beforeContext);
  }

  async #applyMove(
    context: GraphContext,
    planner: PlannerContext,
    resolution: Extract<DecisionResolution, { kind: 'move' }>,
    beforeContext: LocationContext | null
  ): Promise<GraphContext> {
    const timestamp = new Date().toISOString();
    const updatedState = await this.#worldStateStore.updateLocationState({
      characterId: planner.characterId,
      locationId: planner.locationId,
      placeId: resolution.target.placeId,
      breadcrumb: resolution.target.breadcrumb,
      certainty: 1,
      updatedAt: timestamp,
      metadata: { reason: 'location-delta-node' },
    });
    const afterContext = buildLocationContextFromTarget(
      planner.locationId,
      resolution.target,
      updatedState.certainty ?? 1
    );
    const delta = buildLocationDelta(beforeContext, afterContext);
    const updatedCharacter =
      context.chronicle.character === null || context.chronicle.character === undefined
        ? context.chronicle.character
        : {
            ...context.chronicle.character,
            locationState: {
              ...updatedState,
              breadcrumb: resolution.target.breadcrumb,
            },
          };
    log('info', 'location-delta-node.move-applied', {
      chronicleId: context.chronicleId,
      destination: resolution.target.name,
    });
    const nextLocationSummary = applyLocationBreadcrumb(
      context.chronicle.location,
      resolution.target
    );
    return {
      ...context,
      chronicle: {
        ...context.chronicle,
        character: updatedCharacter,
        location: nextLocationSummary ?? context.chronicle.location ?? null,
      },
      locationPlan: null,
      locationSummary: nextLocationSummary ?? context.chronicle.location ?? null,
      locationContext: afterContext,
      locationDelta: delta,
    };
  }

  #shouldApplyDelta(context: GraphContext): boolean {
    const type = context.resolvedIntentType ?? context.playerIntent?.intentType;
    return type === 'action' || type === 'planning';
  }

  #isRunnable(
    context: GraphContext,
    gmMessageContent?: string | null,
    characterId?: string | null
  ): boolean {
    return (
      context.failure !== true &&
      this.#shouldApplyDelta(context) &&
      isNonEmptyString(gmMessageContent) &&
      isNonEmptyString(characterId)
    );
  }
}

const DEFAULT_PLACE_KIND: LocationPlace['kind'] = 'locale';

const mapLinkToRelationKind = (link: DeltaDecision['link']): LocationEdgeKind | null => {
  switch (link) {
  case 'inside':
    return 'CONTAINS';
  case 'adjacent':
    return 'ADJACENT_TO';
  case 'linked':
    return 'LINKS_TO';
  default:
    return null;
  }
};

const toLocationPlace = (entry: LocationBreadcrumbEntry): LocationPlace => ({
  id: entry.id,
  name: entry.name,
  kind: entry.kind,
  description: undefined,
  metadata: undefined,
  tags: [],
});

const buildBreadcrumbForRelation = (
  currentBreadcrumb: LocationBreadcrumbEntry[],
  relationKind: LocationEdgeKind,
  place: LocationPlace
): LocationBreadcrumbEntry[] => {
  const entry = { id: place.id, kind: place.kind, name: place.name };
  if (relationKind === 'CONTAINS') {
    return [...currentBreadcrumb, entry];
  }
  const parentTrail = currentBreadcrumb.slice(0, -1);
  if (parentTrail.length === 0) {
    return [entry];
  }
  return [...parentTrail, entry];
};

const applyLocationBreadcrumb = (
  summary: LocationSummary | null | undefined,
  target: NeighborRef
): LocationSummary | null => {
  if (!summary) {
    return null;
  }
  return {
    ...summary,
    breadcrumb: target.breadcrumb,
  };
};

const buildLocationContextFromTarget = (
  locationId: string,
  target: NeighborRef,
  certainty: number
): LocationContext => {
  const breadcrumb = target.breadcrumb ?? [];
  const leaf = breadcrumb.at(-1);
  return {
    breadcrumb,
    certainty,
    locationId,
    placeId: target.placeId,
    placeName: target.name,
    placeKind: leaf?.kind ?? DEFAULT_PLACE_KIND,
  };
};

const buildLocationDelta = (
  beforeContext: LocationContext | null,
  afterContext: LocationContext | null
): LocationDelta | null => {
  if (!afterContext && !beforeContext) {
    return null;
  }
  if (
    beforeContext &&
    afterContext &&
    beforeContext.locationId === afterContext.locationId &&
    beforeContext.placeId === afterContext.placeId
  ) {
    return null;
  }
  return {
    after: afterContext ?? undefined,
    before: beforeContext ?? undefined,
  };
};
