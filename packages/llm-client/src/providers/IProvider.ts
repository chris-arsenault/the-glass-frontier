import type { LLMRequest } from '../types';

export type ProviderResponse = {
  output_text: string;
  usage: {
    [key: string]: number;
    input_tokens: number;
    output_tokens: number;
  };
  rawResponse: Record<string, unknown>;
};

export type IProvider = {
  readonly id: string;
  readonly supportsStreaming: boolean;
  readonly valid: boolean;

  execute: (request: LLMRequest, signal?: AbortSignal) => Promise<ProviderResponse>;
};
