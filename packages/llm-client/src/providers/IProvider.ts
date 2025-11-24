import { LLMRequest } from '../types';

export type ProviderResponse = {
  output_text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    [key: string]: number;
  };
  rawResponse: Record<string, unknown>;
};

export interface IProvider {
  readonly id: string;
  readonly supportsStreaming: boolean;
  readonly valid: boolean;

  execute(request: LLMRequest, signal?: AbortSignal): Promise<ProviderResponse>;
}
