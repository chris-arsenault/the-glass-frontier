import type { ReasoningEffort } from '@glass-frontier/app';
import type { LoggableMetadata } from '@glass-frontier/utils';

export type PromptContentSegment = {
  type: 'input_text';
  text: string;
};

export type PromptInput = {
  role: 'user' | 'developer';
  content: PromptContentSegment[];
};

export type Prompt = {
  instructions: string;
  input: PromptInput[];
};

export type LLMPlayer = {
  id: string;
  isAdmin: boolean;
  name: string;
};

export type LLMRequest = {
  instructions: string;
  input: PromptInput[];
  maxOutputTokens: number;
  metadata: LoggableMetadata;
  model: string;
  player: LLMPlayer;
  reasoningEffort: ReasoningEffort;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type LLMResponse = {
  attempts: number;
  durationMs?: number;
  message: unknown;
  metadata: LoggableMetadata;
  providerId: string;
  requestBody: LLMRequest;
  requestId: string;
  responseBody: Record<string, unknown>;
  usage: TokenUsage;
};

export type ModelCategory = 'prose' | 'classification';
