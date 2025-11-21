/* eslint-disable sonarjs/no-duplicate-string */
import type { PromptTemplateId } from '@glass-frontier/dto';
import { getPromptInput } from '@glass-frontier/gm-api/prompts/locationHelpers';
import { isNonEmptyString } from '@glass-frontier/utils';

import type { GraphContext } from '../types';
import { trimBeatsList, trimBreadcrumbList, trimSkillsList } from './contextFormaters';

export type ChronicleFragmentTypes =
  | 'character'
  | 'location'
  | 'beats'
  | 'intent'
  | 'gm-response'
  | 'skill-check'
  | 'user-message'
  | 'recent-events'
  | 'tone'
  | 'wrap'
  | 'location-detail'
  | 'inventory'
  | 'inventory-detail'
  | 'seed';

// prettier-ignore
export const templateFragmentMapping: Partial<Record<PromptTemplateId, ChronicleFragmentTypes[]>> = {
  'action-resolver': ['recent-events', 'tone', 'intent', 'character', 'skill-check', 'location', 'inventory-detail', 'seed'],
  'beat-tracker': ['intent', 'beats'],
  'check-planner': ['intent', 'character', 'location'],
  'clarification-responder': ['recent-events', 'tone', 'intent', 'character', 'location', 'inventory-detail', 'seed'],
  'gm-summary': ['intent', 'character', 'skill-check', 'wrap'],
  'inquiry-describer': ['recent-events', 'tone', 'intent', 'character', 'location', 'inventory-detail', 'seed'],
  'intent-beat-detector': ['intent', 'beats'],
  'intent-classifier': ['character', 'location', 'beats', 'wrap'],
  'inventory-delta': ['intent', 'user-message', 'inventory'],
  'location-delta': ['intent', 'user-message', 'location-detail'],
  'planning-narrator': ['recent-events', 'tone', 'intent', 'character', 'skill-check', 'location', 'inventory-detail', 'seed'],
  'possibility-advisor': ['recent-events', 'tone', 'intent', 'character', 'location', 'inventory-detail', 'seed'],
  'reflection-weaver': ['recent-events', 'tone', 'intent', 'character', 'location', 'inventory-detail', 'seed'],
  'wrap-resolver': ['recent-events', 'tone', 'intent', 'character', 'skill-check', 'location', 'inventory-detail', 'wrap', 'seed'],
};

type FragmentHandler = (context: GraphContext) => Promise<unknown> | unknown;

const fragmentHandlers: Record<ChronicleFragmentTypes, FragmentHandler> = {
  beats: beatsFragment,
  character: characterFragment,
  'gm-response': gmResponseFragment,
  intent: intentFragment,
  inventory: inventoryFragment,
  'inventory-detail': inventoryDetailFragment,
  location: locationFragment,
  'location-detail': locationDetailFragment,
  'recent-events': recentEventsFragment,
  seed: seedFragment,
  'skill-check': skillCheckFragment,
  tone: toneFragment,
  'user-message': userMessageFragment,
  wrap: wrapFragment,
};

export function extractFragment(
  fragmentType: ChronicleFragmentTypes,
  context: GraphContext
): Promise<unknown> | unknown {
  // eslint-disable-next-line securityPlugin/detect-object-injection
  const handler = fragmentHandlers[fragmentType];
  return handler(context);
}

function userMessageFragment(context: GraphContext): string {
  return context.playerMessage.content;
}

function characterFragment(context: GraphContext): Record<string, unknown> {
  return {
    archetype: context.chronicleState.character?.archetype,
    attributes: context.chronicleState.character?.attributes,
    name: context.chronicleState.character?.name,
    pronouns: context.chronicleState.character?.pronouns,
    skills: trimSkillsList(Object.values(context.chronicleState.character?.skills ?? {})),
  };
}

// eslint-disable-next-line complexity
async function locationFragment(context: GraphContext): Promise<Record<string, unknown>> {
  const anchorId =
    context.chronicleState.location?.anchorPlaceId ?? context.chronicleState.chronicle.locationId;
  if (!isNonEmptyString(anchorId)) {
    return {
      breadcrumbs: [],
      description: null,
      name: null,
      tags: [],
    };
  }
  try {
    const details = await context.locationGraphStore.getLocationDetails({ id: anchorId });
    return {
      breadcrumbs: trimBreadcrumbList(details.breadcrumb),
      description: details.place.description,
      name: details.place.name,
      tags: details.place.tags ?? [],
    };
  } catch {
    return {
      breadcrumbs: trimBreadcrumbList(context.chronicleState.location?.breadcrumb ?? []),
      description: context.chronicleState.location?.description ?? null,
      name: context.chronicleState.location?.breadcrumb.at(-1)?.name ?? null,
      tags: context.chronicleState.location?.tags ?? [],
    };
  }
}

async function locationDetailFragment(context: GraphContext): Promise<unknown> {
  const promptInput = await getPromptInput(context);
  if (promptInput === null) {
    return 'Lost In Space';
  }

  return {
    children: promptInput.children,
    links: promptInput.links,
    parent: promptInput.parent,
    self: promptInput.current,
    siblings: promptInput.adjacent,
  };
}

function inventoryFragment(context: GraphContext): Array<Record<string, unknown>> {
  return (context.chronicleState.character?.inventory ?? []).map((item) => ({
    kind: item.kind,
    name: item.name,
    quantity: item.quantity,
  }));
}

function inventoryDetailFragment(context: GraphContext): Array<Record<string, unknown>> {
  return (context.chronicleState.character?.inventory ?? []).map((item) => ({
    description: item.description,
    effect: item.effect,
    kind: item.kind,
    name: item.name,
    quantity: item.quantity,
  }));
}

function beatsFragment(context: GraphContext): unknown {
  return trimBeatsList(context.chronicleState.chronicle.beats);
}

function intentFragment(context: GraphContext): Record<string, unknown> {
  return {
    beatDirective: context.playerIntent?.beatDirective.summary,
    summary: context.playerIntent?.intentSummary,
    targetBeat: context.playerIntent?.beatDirective.targetBeatId,
    type: context.playerIntent?.intentType,
  };
}

function toneFragment(context: GraphContext): string {
  return `*IMPORTANT*: ${context.playerIntent?.tone}`;
}

function skillCheckFragment(context: GraphContext): Record<string, unknown> {
  return {
    advantage: context.skillCheckResult?.advantage,
    outcome: context.skillCheckResult?.outcomeTier,
    riskLevel: context.skillCheckPlan?.riskLevel,
    skill: context.skillCheckPlan?.skill,
  };
}

function gmResponseFragment(context: GraphContext): string | undefined {
  return context.gmResponse?.content;
}

function recentEventsFragment(context: GraphContext): string {
  return context.chronicleState.turns
    .slice(-10)
    .map(
      (turn, index) =>
        `${index + 1} P: ${turn.playerIntent?.intentSummary ?? ''}\n   G: ${turn.gmSummary ?? ''}`
    )
    .join('\n');
}

function wrapFragment(context: GraphContext): Record<string, number> | string {
  const targetEndTurn = context.chronicleState.chronicle?.targetEndTurn;
  if (targetEndTurn === undefined || targetEndTurn === null) {
    return '';
  }
  return {
    turnsLeft: targetEndTurn - context.turnSequence,
  };
}

function seedFragment(context: GraphContext): string | undefined {
  return context.chronicleState.chronicle.seedText;
}
