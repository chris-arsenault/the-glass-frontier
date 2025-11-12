import {
  Attribute,
  type Intent,
  type OutcomeTier,
  type SkillCheckPlan,
  type SkillCheckResult,
  type Inventory,
  type PendingEquip,
  type ImbuedRegistry,
} from '@glass-frontier/dto';
import type { PromptTemplateId } from '@glass-frontier/dto';

import type { ChronicleState } from '../../types';
import type { PromptTemplateRuntime } from './templateRuntime';

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
    attribute: intent.attribute,
    characterName: chronicle?.character?.name ?? 'Unknown',
    characterTags: charTags,
    intentSummary: intent.intentSummary,
    locale: describeLocation(chronicle),
    momentum: chronicle?.character?.momentum.current ?? 0,
    skill: intent.skill,
    skillsLine,
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
    checkAdvantage: check?.advantage,
    checkDifficulty: check?.riskLevel,
    checkOutcome: checkResult?.outcomeTier ?? 'none',
    gmMessage,
    hasCheck: Boolean(check),
    intentSummary: intent.intentSummary,
    skillLine,
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
    attributeList: Attribute.options.join(', '),
    attributeQuotedList: Attribute.options.map((attr) => `"${attr}"`).join(', '),
    characterName: chronicle?.character?.name ?? 'Unknown',
    characterTags: charTags,
    locale: describeLocation(chronicle),
    playerMessage,
    promptHeader:
      'You are The Glass Frontier LangGraph GM. Maintain collaborative tone, highlight stakes transparently, and respect prohibited capabilities.',
    skillsLine,
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
  const recentEventLines: string[] = [];
  if (chronicle.turns?.length) {
    chronicle.turns
      .slice(-10)
      .forEach((turn) => {
        const snippet = `${turn.gmSummary ?? ''} - ${turn.playerIntent?.intentSummary ?? ''}`.trim();
        if (snippet) {
          recentEventLines.push(snippet);
        }
      });
  }
  const recentEvents =
    recentEventLines.join('; ') || chronicle.chronicle?.seedText || 'no prior events noted';
  const playerUtterance =
    rawUtterance.length > 500 ? `${rawUtterance.slice(0, 500)}…` : rawUtterance;

  const hasMechanicalContext = Boolean(check && intent.requiresCheck);
  const shouldUseComplications =
    Boolean(outcomeTier && ['regress', 'collapse'].includes(outcomeTier)) &&
    Boolean(check?.complicationSeeds?.length);

  return renderTemplate(templates, 'narrative-weaver', {
    characterName,
    characterTags,
    checkAdvantage: check?.advantage,
    checkDifficulty: check?.riskLevel,
    chronicleSeed: chronicle.chronicle?.seedText ?? null,
    complicationSeeds: shouldUseComplications ? (check?.complicationSeeds ?? []) : [],
    creativeSpark: intent.creativeSpark,
    hasMechanicalContext,
    intentAttribute: intent.attribute,
    intentSkill: intent.skill,
    intentSummary: intent.intentSummary,
    locale,
    outcomeTier: outcomeTier ?? 'stall',
    outcomeValue: outcomeTier ?? 'stall',
    playerMessage: rawUtterance,
    playerUtterance,
    recentEvents,
    shouldUseComplications,
    tone: intent.tone,
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
    adjacent: input.adjacent,
    children: input.children,
    current: input.current,
    gm_response: truncateSnippet(input.gmResponse),
    links: input.links,
    parent: input.parent,
    player_intent: truncateSnippet(input.playerIntent),
  });
}

export function composeInventoryDeltaPrompt({
  gmMessage,
  gmSummary,
  intent,
  inventory,
  pendingEquip,
  registry,
  templates,
}: {
  templates: PromptTemplateRuntime;
  inventory: Inventory;
  gmMessage: string;
  gmSummary?: string | null;
  intent: Intent;
  pendingEquip: PendingEquip[];
  registry: ImbuedRegistry;
}): Promise<string> {
  return renderTemplate(templates, 'inventory-arbiter', {
    gm_narration: truncateSnippet(gmMessage, 900),
    gm_summary: truncateSnippet(gmSummary ?? '', 400),
    intent_attribute: intent.attribute ?? null,
    intent_skill: intent.skill ?? null,
    intent_summary: intent.intentSummary,
    inventory_json: JSON.stringify(inventory, null, 2),
    pending_equip_json: JSON.stringify(pendingEquip ?? []),
    registry_json: JSON.stringify(registry ?? {}, null, 2),
    revision: inventory.revision,
    revision_next: inventory.revision + 1,
  });
}

function truncateSnippet(value: string, max = 400): string {
  if (!value) {
    return '';
  }
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
