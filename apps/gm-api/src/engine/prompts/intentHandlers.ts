import type { Intent, SkillCheckPlan, SkillCheckResult } from '@glass-frontier/worldstate';
import { z } from 'zod';

import type { GraphContext } from '../graphNode';
import { summarizeCharacter, truncate } from '../prompts';

export type IntentHandlerPrompt = {
  model: string;
  templateId: string;
  variables: Record<string, unknown>;
  schema: z.ZodSchema<{
    text: string;
  }>;
};

const NarrationSchema = z.object({
  text: z.string().min(1),
});

const DEFAULT_HANDLER_MODEL = 'gpt-4.1-mini';

type HandlerPromptOptions = {
  chronicle: GraphContext['chronicle'];
  character: GraphContext['character'];
  playerIntent: Intent;
  playerMessage: string;
  turnSequence: number;
  checkPlan?: SkillCheckPlan;
  checkResult?: SkillCheckResult;
  gmSummary?: string;
};

const baseVariables = (options: HandlerPromptOptions): Record<string, unknown> => ({
  beatsEnabled: options.chronicle.beatsEnabled !== false,
  characterSummary: summarizeCharacter(options.character),
  gmSummary: truncate(options.gmSummary ?? '', 400),
  hasCheckPlan: Boolean(options.checkPlan),
  hasCheckResult: Boolean(options.checkResult),
  intentSummary: truncate(options.playerIntent.summary ?? '', 240),
  playerMessage: truncate(options.playerMessage ?? '', 900),
  turnSequence: options.turnSequence,
});

const buildPrompt = (templateId: string, variables: Record<string, unknown>): IntentHandlerPrompt => ({
  model: DEFAULT_HANDLER_MODEL,
  schema: NarrationSchema,
  templateId,
  variables,
});

export const composeActionHandlerPrompt = (options: HandlerPromptOptions): IntentHandlerPrompt =>
  buildPrompt('action-handler', baseVariables(options));

export const composeInquiryHandlerPrompt = (options: HandlerPromptOptions): IntentHandlerPrompt =>
  buildPrompt('inquiry-handler', baseVariables(options));

export const composeClarificationHandlerPrompt = (
  options: HandlerPromptOptions
): IntentHandlerPrompt => buildPrompt('clarification-handler', baseVariables(options));

export const composePossibilityHandlerPrompt = (
  options: HandlerPromptOptions
): IntentHandlerPrompt => buildPrompt('possibility-handler', baseVariables(options));

export const composePlanningHandlerPrompt = (
  options: HandlerPromptOptions
): IntentHandlerPrompt => buildPrompt('planning-handler', baseVariables(options));

export const composeReflectionHandlerPrompt = (
  options: HandlerPromptOptions
): IntentHandlerPrompt => buildPrompt('reflection-handler', baseVariables(options));
