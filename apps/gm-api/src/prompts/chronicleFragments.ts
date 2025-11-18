
import type { PromptTemplateId } from '@glass-frontier/dto';
import {GraphContext} from "../types";
import {trimBeatsList, trimBreadcrumbList, trimSkillsList} from "./contextFormaters";
export type ChronicleFragmentTypes = "character" | "location" | "beats" | "intent" | "gm-response" | "skill-check" | "user-message"

export const templateFragmentMapping: Partial<Record<PromptTemplateId, ChronicleFragmentTypes[]>> = {
  "intent-classifier": ['character', 'location', 'beats'],
  "intent-beat-detector": ['intent', 'beats'],
  "beat-director": ['intent', 'beats', 'gm-response'],
  "check-planner": ['intent', 'character', 'location'],
  "gm-summary": ['intent', 'character', 'skill-check'],
}

export function extractFragment(fragmentType: ChronicleFragmentTypes, context: GraphContext): any {
  switch (fragmentType) {
    case 'character':
      return characterFragment(context);
    case 'location':
      return locationFragment(context);
    case 'beats':
      return beatsFragment(context);
    case 'intent':
      return intentFragment(context);
    case 'gm-response':
      return gmResponseFragment(context);
    case 'skill-check':
      return skillCheckFragment(context);
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

function beatsFragment(context: GraphContext): any {
  return trimBeatsList(context.chronicleState.chronicle.beats);
}

function intentFragment(context: GraphContext): any {
  return {
    type: context.playerIntent?.intentType,
    summary: context.playerIntent?.intentSummary
  }
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

