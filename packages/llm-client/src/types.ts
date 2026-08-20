import type { LoggableMetadata } from '@glass-frontier/utils';
import type { ResponseFormatTextConfig } from 'openai/resources/responses/responses';

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

export type LLMRequest = {
  instructions: string;
  input: PromptInput[];
  max_output_tokens: number;
  metadata: LoggableMetadata;
  model: string;
  reasoning: {
    effort: 'minimal' | 'high';
  };
  text: {
    format?: ResponseFormatTextConfig;
    verbosity: 'low' | 'high';
  };
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
  usage: Record<string, unknown>;
};

export type ModelCategory = 'prose' | 'classification';
