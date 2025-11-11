import {
  Attribute,
  type Intent,
  type OutcomeTier,
  type SkillCheckPlan,
  type SkillCheckResult,
} from '@glass-frontier/dto';
import type { ChronicleState } from '../../types';
import type { PromptTemplateRuntime } from './templateRuntime';
import type { PromptTemplateId } from '@glass-frontier/dto';

async function renderTemplate(
  templates: PromptTemplateRuntime,
  templateId: PromptTemplateId,
  data: Record<string, unknown>
): Promise<string> {
  return templates.render(templateId, data);
}

export function composeCheckRulesPrompt(
  intent: Intent,
  chronicle: ChronicleState,
  templates: PromptTemplateRuntime
): Promise<string> {
  const charTags = (chronicle?.character?.tags ?? []).slice(0, 3).join(', ') || 'No tags';
  const skillsLine = Object.keys(chronicle?.character?.skills ?? {}).join(', ') || 'None';

  return renderTemplate(templates, 'check-planner', {
    intentSummary: intent.intentSummary,
    skill: intent.skill,
    attribute: intent.attribute,
    characterName: chronicle?.character?.name ?? 'Unknown',
    characterTags: charTags,
    skillsLine,
    locale: describeLocation(chronicle),
    momentum: chronicle?.character?.momentum.current ?? 0,
  });
}

export function composeGMSummaryPrompt(
  templates: PromptTemplateRuntime,
  gmMessage: string,
  intent: Intent,
  check?: SkillCheckPlan,
  checkResult?: SkillCheckResult
): Promise<string> {
  const skillLine = intent.skill
    ? `${intent.skill}${intent.attribute ? ` (${intent.attribute})` : ''}`
    : null;

  return renderTemplate(templates, 'gm-summary', {
    gmMessage,
    intentSummary: intent.intentSummary,
    skillLine,
    hasCheck: Boolean(check),
    checkDifficulty: check?.riskLevel,
    checkAdvantage: check?.advantage,
    checkOutcome: checkResult?.outcomeTier ?? 'none',
  });
}

export function composeIntentPrompt({
  chronicle,
  playerMessage,
  templates,
}: {
  chronicle: ChronicleState;
  playerMessage: string;
  templates: PromptTemplateRuntime;
}): Promise<string> {
  const charTags = (chronicle?.character?.tags ?? []).slice(0, 3).join(', ') || 'No tags';
  const skillsLine = Object.keys(chronicle?.character?.skills ?? {}).join(', ') || 'None';

  return renderTemplate(templates, 'intent-intake', {
    promptHeader:
      'You are The Glass Frontier LangGraph GM. Maintain collaborative tone, highlight stakes transparently, and respect prohibited capabilities.',
    playerMessage,
    characterName: chronicle?.character?.name ?? 'Unknown',
    characterTags: charTags,
    skillsLine,
    locale: describeLocation(chronicle),
    attributeList: Attribute.options.join(', '),
    attributeQuotedList: Attribute.options.map((attr) => `"${attr}"`).join(', '),
  });
}

export function composeNarrationPrompt(
  intent: Intent,
  chronicle: ChronicleState,
  rawUtterance: string,
  templates: PromptTemplateRuntime,
  check?: SkillCheckPlan,
  outcomeTier?: OutcomeTier
): Promise<string> {
  const characterName = chronicle.character?.name ?? 'the character';
  const characterTags = (chronicle.character?.tags ?? []).slice(0, 3).join(', ') || 'untagged';
  const locale = describeLocation(chronicle);
  const recentEvents =
    chronicle.turns
      ?.slice(-3)
      .map((turn) => `${turn.gmSummary ?? ''} ${turn.playerIntent?.intentSummary ?? ''}`.trim())
      .filter(Boolean)
      .join('; ') || 'no prior events noted';
  const playerUtterance =
    rawUtterance.length > 500 ? `${rawUtterance.slice(0, 500)}…` : rawUtterance;

  const hasMechanicalContext = Boolean(check && intent.requiresCheck);
  const shouldUseComplications =
    Boolean(outcomeTier && ['regress', 'collapse'].includes(outcomeTier)) &&
    Boolean(check?.complicationSeeds?.length);

  return renderTemplate(templates, 'narrative-weaver', {
    characterName,
    characterTags,
    locale,
    recentEvents,
    playerUtterance,
    intentSummary: intent.intentSummary,
    tone: intent.tone,
    creativeSpark: intent.creativeSpark,
    hasMechanicalContext,
    intentSkill: intent.skill,
    intentAttribute: intent.attribute,
    checkDifficulty: check?.riskLevel,
    checkAdvantage: check?.advantage,
    outcomeTier: outcomeTier ?? 'stall',
    outcomeValue: outcomeTier ?? 'stall',
    shouldUseComplications,
    complicationSeeds: shouldUseComplications ? (check?.complicationSeeds ?? []) : [],
    playerMessage: rawUtterance,
  });
}

function describeLocation(chronicle: ChronicleState): string {
  const summary = chronicle.location;
  if (!summary) {
    return 'an unknown place';
  }
  if (summary.description) {
    return summary.description;
  }
  const path = summary.breadcrumb.map((entry) => entry.name).join(' → ');
  return path || 'an unknown place';
}

export function composeLocationDeltaPrompt(
  templates: PromptTemplateRuntime,
  input: {
    current: string;
    parent: string | null;
    children: string[];
    adjacent: string[];
    links: string[];
    playerIntent: string;
    gmResponse: string;
  }
): Promise<string> {
  return renderTemplate(templates, 'location-delta', {
    current: input.current,
    parent: input.parent,
    children: input.children,
    adjacent: input.adjacent,
    links: input.links,
    player_intent: truncateSnippet(input.playerIntent),
    gm_response: truncateSnippet(input.gmResponse),
  });
}

function truncateSnippet(value: string, max = 400): string {
  if (!value) {
    return '';
  }
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
