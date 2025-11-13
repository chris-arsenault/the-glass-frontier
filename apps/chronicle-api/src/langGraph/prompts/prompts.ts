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

type GmSummaryPromptOptions = {
  templates: PromptTemplateRuntime;
  gmMessage: string;
  intent: Intent;
  check?: SkillCheckPlan;
  checkResult?: SkillCheckResult;
};

type NarrationPromptOptions = {
  check?: SkillCheckPlan;
  chronicle: ChronicleState;
  intent: Intent;
  outcomeTier?: OutcomeTier;
  rawUtterance: string;
  templates: PromptTemplateRuntime;
};

const ATTRIBUTE_LIST = Attribute.options.join(', ');
const ATTRIBUTE_QUOTED_LIST = Attribute.options.map((attr) => `"${attr}"`).join(', ');
const COMPLICATION_OUTCOMES = new Set<OutcomeTier>(['regress', 'collapse']);
type TemplatePayload = Record<string, unknown>;

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
  return renderTemplate(templates, 'check-planner', buildCheckPlannerPayload(intent, chronicle));
}

export function composeGMSummaryPrompt(options: GmSummaryPromptOptions): Promise<string> {
  return renderTemplate(options.templates, 'gm-summary', buildGmSummaryPayload(options));
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
  const charTags = summarizeTags(chronicle?.character?.tags, 'No tags');
  const skillsLine = summarizeSkills(chronicle?.character?.skills);

  return renderTemplate(templates, 'intent-intake', {
    attributeList: ATTRIBUTE_LIST,
    attributeQuotedList: ATTRIBUTE_QUOTED_LIST,
    characterName: chronicle?.character?.name ?? 'Unknown',
    characterTags: charTags,
    locale: describeLocation(chronicle),
    playerMessage,
    promptHeader:
      'You are The Glass Frontier LangGraph GM. Maintain collaborative tone, highlight stakes transparently, and respect prohibited capabilities.',
    skillsLine,
  });
}

export function composeNarrationPrompt(options: NarrationPromptOptions): Promise<string> {
  return renderTemplate(
    options.templates,
    'narrative-weaver',
    buildNarrationPayload(options)
  );
}

function buildCheckPlannerPayload(intent: Intent, chronicle: ChronicleState): TemplatePayload {
  return {
    attribute: intent.attribute,
    characterName: resolveCharacterName(chronicle),
    characterTags: summarizeTags(chronicle?.character?.tags, 'No tags'),
    intentSummary: intent.intentSummary,
    locale: describeLocation(chronicle),
    momentum: resolveMomentum(chronicle),
    skill: intent.skill,
    skillsLine: summarizeSkills(chronicle?.character?.skills),
  };
}

function buildGmSummaryPayload({
  check,
  checkResult,
  gmMessage,
  intent,
}: GmSummaryPromptOptions): TemplatePayload {
  return {
    checkAdvantage: check?.advantage,
    checkDifficulty: check?.riskLevel,
    checkOutcome: checkResult?.outcomeTier ?? 'none',
    gmMessage,
    hasCheck: Boolean(check),
    intentSummary: intent.intentSummary,
    skillLine: buildSkillLine(intent),
  };
}

function buildNarrationPayload(options: NarrationPromptOptions): TemplatePayload {
  return {
    ...buildNarrationBase(options),
    ...buildNarrationMechanics(options),
  };
}

function buildNarrationBase({
  chronicle,
  intent,
  rawUtterance,
}: NarrationPromptOptions): TemplatePayload {
  return {
    characterName: chronicle.character?.name ?? 'the character',
    characterTags: summarizeTags(chronicle.character?.tags, 'untagged'),
    locale: describeLocation(chronicle),
    playerMessage: rawUtterance,
    playerUtterance: truncateText(rawUtterance, 500),
    recentEvents: buildRecentEventsSummary(chronicle),
    tone: intent.tone,
  };
}

function buildNarrationMechanics(options: NarrationPromptOptions): TemplatePayload {
  const useComplications = shouldUseComplications(options.check, options.outcomeTier);
  return {
    ...buildNarrationCheckData(options, useComplications),
    ...buildNarrationIntentData(options),
  };
}

function buildNarrationCheckData(
  options: NarrationPromptOptions,
  useComplications: boolean
): TemplatePayload {
  const complicationSeeds = useComplications ? collectComplicationSeeds(options.check) : [];
  return {
    checkAdvantage: options.check?.advantage,
    checkDifficulty: options.check?.riskLevel,
    chronicleSeed: options.chronicle.chronicle?.seedText ?? null,
    complicationSeeds,
    outcomeTier: options.outcomeTier ?? 'stall',
    outcomeValue: options.outcomeTier ?? 'stall',
    shouldUseComplications: useComplications,
  };
}

function buildNarrationIntentData({ check, intent }: NarrationPromptOptions): TemplatePayload {
  return {
    creativeSpark: intent.creativeSpark,
    hasMechanicalContext: Boolean(check) && intent.requiresCheck === true,
    intentAttribute: intent.attribute,
    intentSkill: intent.skill,
    intentSummary: intent.intentSummary,
  };
}

function describeLocation(chronicle: ChronicleState): string {
  const summary = chronicle.location;
  if (summary === undefined || summary === null) {
    return 'an unknown place';
  }
  if (isNonEmptyString(summary.description)) {
    return summary.description;
  }
  const path = summary.breadcrumb.map((entry) => entry.name).join(' → ');
  return path.length > 0 ? path : 'an unknown place';
}

function summarizeTags(tags?: string[] | null, fallback = 'No tags'): string {
  if (!Array.isArray(tags) || tags.length === 0) {
    return fallback;
  }
  return tags.slice(0, 3).join(', ');
}

function summarizeSkills(skills?: Record<string, unknown> | null): string {
  if (skills === undefined || skills === null) {
    return 'None';
  }
  const names = Object.keys(skills);
  return names.length > 0 ? names.join(', ') : 'None';
}

function buildSkillLine(intent: Intent): string | null {
  if (!isNonEmptyString(intent.skill)) {
    return null;
  }
  return isNonEmptyString(intent.attribute)
    ? `${intent.skill} (${intent.attribute})`
    : intent.skill;
}

function resolveCharacterName(chronicle: ChronicleState): string {
  return chronicle?.character?.name ?? 'Unknown';
}

function resolveMomentum(chronicle: ChronicleState): number {
  return chronicle?.character?.momentum.current ?? 0;
}

function buildRecentEventsSummary(chronicle: ChronicleState): string {
  if (!Array.isArray(chronicle.turns) || chronicle.turns.length === 0) {
    return chronicle.chronicle?.seedText ?? 'no prior events noted';
  }
  const snippets = chronicle.turns
    .slice(-10)
    .map((turn) => `${turn.gmSummary ?? ''} - ${turn.playerIntent?.intentSummary ?? ''}`.trim())
    .filter((snippet) => snippet.length > 0);
  if (snippets.length === 0) {
    return chronicle.chronicle?.seedText ?? 'no prior events noted';
  }
  return snippets.join('; ');
}

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
}

function shouldUseComplications(check?: SkillCheckPlan, outcome?: OutcomeTier): boolean {
  if (check === undefined || check === null || outcome === undefined) {
    return false;
  }
  const seeds = Array.isArray(check.complicationSeeds) ? check.complicationSeeds : [];
  return seeds.length > 0 && COMPLICATION_OUTCOMES.has(outcome);
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
  if (!isNonEmptyString(value)) {
    return '';
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return '';
  }
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

const collectComplicationSeeds = (check?: SkillCheckPlan): string[] => {
  if (check === undefined || check === null) {
    return [];
  }
  return Array.isArray(check.complicationSeeds) ? check.complicationSeeds : [];
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
