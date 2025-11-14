import type {
  Intent,
  PromptTemplateId,
  SkillCheckPlan,
  SkillCheckResult,
} from '@glass-frontier/dto';

import type { ChronicleState } from '../../types';
import {
  buildRecentEventsSummary,
  buildSkillLine,
  describeBeats,
  describeLocation,
  deriveWrapUpState,
  resolveMomentum,
  summarizeTags,
  truncateText,
} from './shared';
import type { PromptTemplateRuntime } from './templateRuntime';

export type IntentHandlerPromptOptions = {
  check?: SkillCheckPlan;
  checkResult?: SkillCheckResult;
  chronicle: ChronicleState;
  intent: Intent;
  playerMessage: string;
  templates: PromptTemplateRuntime;
  turnSequence: number;
};

export type IntentHandlerPromptComposer = (
  options: IntentHandlerPromptOptions
) => Promise<string>;

const renderTemplate = (
  templates: PromptTemplateRuntime,
  templateId: PromptTemplateId,
  data: Record<string, unknown>
): Promise<string> => templates.render(templateId, data);

export const composeActionResolverPrompt: IntentHandlerPromptComposer = (options) =>
  renderTemplate(
    options.templates,
    'action-resolver',
    buildIntentHandlerPayload('action', options)
  );

export const composeInquiryResponderPrompt: IntentHandlerPromptComposer = (options) =>
  renderTemplate(
    options.templates,
    'inquiry-describer',
    buildIntentHandlerPayload('inquiry', options)
  );

export const composeClarificationResponderPrompt: IntentHandlerPromptComposer = (options) =>
  renderTemplate(
    options.templates,
    'clarification-retriever',
    buildIntentHandlerPayload('clarification', options)
  );

export const composePossibilityAdvisorPrompt: IntentHandlerPromptComposer = (options) =>
  renderTemplate(
    options.templates,
    'possibility-advisor',
    buildIntentHandlerPayload('possibility', options)
  );

export const composePlanningNarratorPrompt: IntentHandlerPromptComposer = (options) =>
  renderTemplate(
    options.templates,
    'planning-narrator',
    buildIntentHandlerPayload('planning', options)
  );

export const composeReflectionWeaverPrompt: IntentHandlerPromptComposer = (options) =>
  renderTemplate(
    options.templates,
    'reflection-weaver',
    buildIntentHandlerPayload('reflection', options)
  );

type IntentHandlerMode =
  | 'action'
  | 'inquiry'
  | 'clarification'
  | 'possibility'
  | 'planning'
  | 'reflection';

function buildIntentHandlerPayload(
  mode: IntentHandlerMode,
  options: IntentHandlerPromptOptions
): Record<string, unknown> {
  const beats = describeBeats(options.chronicle);
  const wrapState = deriveWrapUpState(options.chronicle, options.turnSequence);
  return {
    activeBeatLines: beats.map(
      (beat, index) => `${index + 1}. ${beat.title} — ${beat.description} (${beat.status})`
    ),
    beatCount: beats.length,
    characterName: options.chronicle.character?.name ?? 'the character',
    characterTags: summarizeTags(options.chronicle.character?.tags, 'untagged'),
    checkAdvantage: options.check?.advantage ?? null,
    checkDifficulty: options.check?.riskLevel ?? null,
    checkOutcome: options.checkResult?.outcomeTier ?? 'none',
    handlerMode: mode,
    hasActiveBeats: beats.length > 0,
    hasSkillCheck: Boolean(options.check),
    intentAttribute: options.intent.attribute,
    intentSummary: options.intent.intentSummary,
    intentTone: options.intent.tone,
    locale: describeLocation(options.chronicle),
    momentum: resolveMomentum(options.chronicle),
    playerMessage: options.playerMessage,
    playerUtterance: truncateText(options.playerMessage, 500),
    recentEvents: buildRecentEventsSummary(options.chronicle),
    skillLine: buildSkillLine(options.intent),
    ...wrapState,
  };
}
