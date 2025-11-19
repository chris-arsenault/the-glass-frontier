
import type { PromptTemplateId } from '@glass-frontier/dto';
import {GraphContext} from "../types";
import {trimBeatsList, trimBreadcrumbList, trimSkillsList} from "./contextFormaters";
import {getPromptInput} from "@glass-frontier/gm-api/prompts/locationHelpers";
export type ChronicleFragmentTypes = "character" | "location" | "beats" | "intent" |
  "gm-response" | "skill-check" | "user-message" | "recent-events" | "tone" | "wrap" |
  "location-detail" | "inventory" | "inventory-detail";

export const templateFragmentMapping: Partial<Record<PromptTemplateId, ChronicleFragmentTypes[]>> = {
  "intent-classifier": ['character', 'location', 'beats'],
  "intent-beat-detector": ['intent', 'beats'],
  "beat-tracker": ['intent', 'beats', 'gm-response'],
  "check-planner": ['intent', 'character', 'location'],
  "gm-summary": ['intent', 'character', 'skill-check'],
  "location-delta": ['intent', 'user-message', 'location-detail'],
  "inventory-delta": ['intent', 'user-message', 'inventory'],
  "action-resolver": ['recent-events', 'tone', 'intent', 'character', 'skill-check', 'inventory-detail'],
  "action-resolver-wrap": ['recent-events', 'tone', 'intent', 'character', 'skill-check', 'inventory-detail',  'wrap'],
  "inquiry-describer": ['recent-events', 'tone', 'intent', 'character', 'skill-check', 'inventory-detail'],
  "clarification-responder": ['recent-events', 'tone', 'intent', 'character', 'skill-check', 'inventory-detail'],
  "possibility-advisor": ['recent-events', 'tone', 'intent', 'character', 'skill-check', 'inventory-detail'],
  "planning-narrator": ['recent-events', 'tone', 'intent', 'character', 'skill-check', 'inventory-detail'],
  "reflection-weaver": ['recent-events', 'tone', 'intent', 'character', 'skill-check', 'inventory-detail'],
}

export function extractFragment(fragmentType: ChronicleFragmentTypes, context: GraphContext): any {
  switch (fragmentType) {
    case 'character':
      return characterFragment(context);
    case 'location':
      return locationFragment(context);
    case 'location-detail':
      return locationDetailFragment(context);
    case 'inventory':
      return inventoryFragment(context);
    case 'inventory-detail':
      return inventoryDetailFragment(context);
    case 'beats':
      return beatsFragment(context);
    case 'intent':
      return intentFragment(context);
    case 'gm-response':
      return gmResponseFragment(context);
    case 'skill-check':
      return skillCheckFragment(context);
    case 'recent-events':
      return recentEventsFragment(context);
    case 'tone':
      return toneFragment(context);
    case 'wrap':
      return wrapFragment(context);
    default:
      return {};
  }
}

function characterFragment(context: GraphContext): any {
  return {
    name: context.chronicleState.character?.name,
    archetype: context.chronicleState.character?.archetype,
    pronouns: context.chronicleState.character?.pronouns,
    attributes: context.chronicleState.character?.attributes,
    skills: trimSkillsList(Object.values(context.chronicleState.character?.skills || {})),
  }
}

function locationFragment(context: GraphContext): any {
  return {
    description: context.chronicleState.location?.description,
    tags: context.chronicleState.location?.tags,
    breadcrumbs: trimBreadcrumbList(context.chronicleState.location?.breadcrumb || []),
  }
}

async function locationDetailFragment(context: GraphContext): Promise<any> {
  const promptInput = await getPromptInput(context);
  if (promptInput === null) {
    return "Lost In Space";
  }

  return {
    children: promptInput.children,
    parent: promptInput.parent,
    siblings: promptInput.adjacent,
    links: promptInput.links,
  }
}

function inventoryFragment(context: GraphContext): any {
  return context.chronicleState.character?.inventory.map(item => {
    return {
      name: item.name,
      kind: item.kind,
      quantity: item.quantity,
    }
  })
}

function inventoryDetailFragment(context: GraphContext): any {
  return context.chronicleState.character?.inventory.map(item => {
    return {
      name: item.name,
      kind: item.kind,
      quantity: item.quantity,
      description: item.description,
      effect: item.effect,
    }
  })
}

function beatsFragment(context: GraphContext): any {
  return trimBeatsList(context.chronicleState.chronicle.beats);
}

function intentFragment(context: GraphContext): any {
  return {
    type: context.playerIntent?.intentType,
    summary: context.playerIntent?.intentSummary
  }
}

function toneFragment(context: GraphContext): any {
  return `*IMPORTANT*:The player has requested this tone for the narration: ${context.playerIntent?.tone}}`
}

function skillCheckFragment(context: GraphContext): any {
  return {
    skill: context.skillCheckPlan?.skill,
    riskLevel: context.skillCheckPlan?.riskLevel,
    advantage: context.skillCheckResult?.advantage,
    outcome: context.skillCheckResult?.outcomeTier
  }
}

function gmResponseFragment(context: GraphContext): any {
  return context.gmResponse?.content
}

function recentEventsFragment(context: GraphContext): any {
  context.chronicleState.turns.slice(-10).map((turn, index) => {
    return `${index + 1} P: ${turn.playerIntent?.intentSummary}\n   G: ${turn.gmSummary}`
  })
}

function wrapFragment(context: GraphContext): any {
  return {
    turnsLeft: context.chronicleState.chronicle.targetEndTurn - context.turnSequence
  }
}
