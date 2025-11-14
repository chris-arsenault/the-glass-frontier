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
import {
  buildRecentEventsSummary,
  buildSkillLine,
  collectComplicationSeeds,
  describeBeats,
  describeLocation,
  deriveWrapUpState,
  formatBeatSection,
  resolveCharacterName,
  resolveMomentum,
  summarizeActiveBeats,
  summarizeIntentDirective,
  summarizeSkills,
  summarizeTags,
  truncateSnippet,
  truncateText,
} from './shared';
import type { PromptTemplateRuntime } from './templateRuntime';

type GmSummaryPromptOptions = {
  chronicle: ChronicleState;
  templates: PromptTemplateRuntime;
  gmMessage: string;
  intent: Intent;
  turnSequence: number;
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
  turnSequence: number;
};

type BeatDirectorPromptOptions = {
  chronicle: ChronicleState;
  gmMessage: string;
  gmSummary?: string | null;
  playerIntent: Intent;
  playerUtterance: string;
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
  const activeBeats = summarizeActiveBeats(chronicle);
  const beatsSection =
    activeBeats.length === 0
      ? 'No chronicle beats are currently defined.'
      : formatBeatSection(activeBeats);

  return renderTemplate(templates, 'intent-intake', {
    attributeList: ATTRIBUTE_LIST,
    attributeQuotedList: ATTRIBUTE_QUOTED_LIST,
    beatsSection,
    characterName: chronicle?.character?.name ?? 'Unknown',
    characterTags: charTags,
    locale: describeLocation(chronicle),
    playerMessage,
    promptHeader:
      'You are The Glass Frontier LangGraph GM. Maintain collaborative tone, highlight stakes transparently, and respect prohibited capabilities.',
    skillsLine,
    totalBeatCount: activeBeats.length,
  });
}

export function composeNarrationPrompt(options: NarrationPromptOptions): Promise<string> {
  return renderTemplate(options.templates, 'narrative-weaver', buildNarrationPayload(options));
}

export function composeBeatDirectorPrompt(options: BeatDirectorPromptOptions): Promise<string> {
  return renderTemplate(options.templates, 'beat-director', buildBeatDirectorPayload(options));
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

function buildGmSummaryPayload(options: GmSummaryPromptOptions): TemplatePayload {
  const { check, checkResult, gmMessage, intent } = options;
  const wrapState = deriveWrapUpState(options.chronicle, options.turnSequence);
  return {
    checkAdvantage: check?.advantage,
    checkDifficulty: check?.riskLevel,
    checkOutcome: checkResult?.outcomeTier ?? 'none',
    gmMessage,
    hasCheck: Boolean(check),
    intentSummary: intent.intentSummary,
    skillLine: buildSkillLine(intent),
    ...wrapState,
  };
}

function buildNarrationPayload(options: NarrationPromptOptions): TemplatePayload {
  return {
    ...buildNarrationBase(options),
    ...buildNarrationMechanics(options),
    ...buildNarrationBeatData(options),
    ...buildNarrationWrapUpData(options),
  };
}

function buildBeatDirectorPayload(options: BeatDirectorPromptOptions): TemplatePayload {
  const beats = describeBeats(options.chronicle);
  return {
    beatCount: beats.length,
    beats,
    gmMessage: truncateSnippet(options.gmMessage, 850),
    gmSummary: truncateSnippet(options.gmSummary ?? '', 400),
    intentDirective: summarizeIntentDirective(options.chronicle, options.playerIntent),
    intentSummary: options.playerIntent.intentSummary,
    playerUtterance: truncateSnippet(options.playerUtterance, 850),
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

function buildNarrationBeatData(options: NarrationPromptOptions): TemplatePayload {
  const activeBeats = describeBeats(options.chronicle).filter(
    (beat) => beat.status === 'in_progress'
  );
  const beatDirectiveNote = summarizeNarrationBeatDirective(
    activeBeats,
    options.intent.beatDirective
  );
  return {
    activeBeatLines: activeBeats.map(
      (beat, index) => `${index + 1}. ${beat.title} — ${beat.description}`
    ),
    beatDirectiveNote,
    hasActiveBeats: activeBeats.length > 0,
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

function buildNarrationWrapUpData(options: NarrationPromptOptions): TemplatePayload {
  return deriveWrapUpState(options.chronicle, options.turnSequence);
}

type WrapDirective = {
  wrapIsFinalTurn: boolean;
  wrapTargetTurn: number | null;
  wrapTurnsRemaining: number | null;
  wrapUpRequested: boolean;
};

function deriveWrapUpState(chronicle: ChronicleState, turnSequence: number): WrapDirective {
  const targetEndTurn = chronicle.chronicle?.targetEndTurn;
  if (typeof targetEndTurn !== 'number' || Number.isNaN(targetEndTurn)) {
    return {
      wrapIsFinalTurn: false,
      wrapTargetTurn: null,
      wrapTurnsRemaining: null,
      wrapUpRequested: false,
    };
  }
  const turnsRemaining = Math.max(targetEndTurn - turnSequence, 0);
  return {
    wrapIsFinalTurn: turnsRemaining === 0,
    wrapTargetTurn: targetEndTurn,
    wrapTurnsRemaining: turnsRemaining,
    wrapUpRequested: true,
  };
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

function summarizeNarrationBeatDirective(
  activeBeats: ReturnType<typeof describeBeats>,
  directive: Intent['beatDirective']
): string | null {
  if (directive === undefined || directive === null) {
    return null;
  }
  if (directive.kind === 'new') {
    return 'A new long-horizon beat was signaled—introduce and progress it quickly so it can close soon.';
  }
  if (directive.kind === 'existing') {
    const match = activeBeats.find((beat) => beat.id === directive.targetBeatId);
    if (match !== undefined) {
      return `The player is acting on "${match.title}". Aim to advance it decisively toward resolution in this narration.`;
    }
    return 'The player referenced an existing beat. Progress whichever beat best fits their intent toward closure.';
  }
  return null;
}
