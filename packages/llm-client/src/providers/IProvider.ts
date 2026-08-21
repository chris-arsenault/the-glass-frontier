import type { LLMRequest, TokenUsage } from '../types';

export type ProviderResponse = {
  output_text: string;
  usage: TokenUsage;
  rawResponse: Record<string, unknown>;
};

export type IProvider = {
  readonly id: string;
  readonly supportsStreaming: boolean;
  readonly valid: boolean;

  execute: (request: LLMRequest, signal?: AbortSignal) => Promise<ProviderResponse>;
};
