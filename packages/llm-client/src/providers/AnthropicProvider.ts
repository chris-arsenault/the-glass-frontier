import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import { ProviderError } from '../ProviderError';
import type { LLMRequest } from '../types';
import type { IProvider, ProviderResponse } from './IProvider';
import type {
  IStructuredOutputProvider,
  StructuredOutputRequest,
  StructuredOutputResponse,
} from './IStructuredOutputProvider';

const sanitizeEnv = (value?: string): string => value?.trim() ?? '';

type AnthropicMessages = {
  messages: Anthropic.Messages.MessageParam[];
  system: Anthropic.Messages.TextBlockParam[];
};

export const mapAnthropicMessages = (request: LLMRequest): AnthropicMessages => {
  const system: Anthropic.Messages.TextBlockParam[] = [
    { text: request.instructions, type: 'text' },
  ];
  const messages: Anthropic.Messages.MessageParam[] = [];
  for (const entry of request.input) {
    const text = entry.content.map((content) => content.text).join('\n');
    if (entry.role === 'developer') {
      system.push({ text, type: 'text' });
    } else {
      messages.push({ content: [{ text, type: 'text' }], role: 'user' });
    }
  }
  return { messages, system };
};

export const mapAnthropicRequest = (
  request: LLMRequest
): Anthropic.Messages.MessageCreateParamsNonStreaming => {
  const { messages, system } = mapAnthropicMessages(request);
  return {
    max_tokens: request.maxOutputTokens,
    messages,
    model: request.model,
    output_config: { effort: request.reasoningEffort },
    system,
    thinking: { type: 'adaptive' },
  };
};

export const mapAnthropicStructuredRequest = <T>(
  request: StructuredOutputRequest<T>
): Anthropic.Messages.MessageCreateParamsNonStreaming => {
  return {
    ...mapAnthropicRequest(request),
    output_config: {
      effort: request.reasoningEffort,
      format: zodOutputFormat(request.schema),
    },
  };
};

export class AnthropicProvider implements IProvider, IStructuredOutputProvider {
  readonly id = 'anthropic';
  readonly supportsStreaming = true;
  readonly valid: boolean;
  readonly #client: Anthropic | null = null;

  constructor() {
    const apiKey = sanitizeEnv(process.env.ANTHROPIC_API_KEY);
    if (apiKey.length === 0) {
      this.valid = false;
      return;
    }
    this.#client = new Anthropic({ apiKey });
    this.valid = true;
  }

  async execute(request: LLMRequest, signal?: AbortSignal): Promise<ProviderResponse> {
    const client = this.#requireClient();
    try {
      const response = await client.messages.create(mapAnthropicRequest(request), { signal });
      const text = this.#extractText(response);
      return {
        output_text: text,
        rawResponse: response as unknown as Record<string, unknown>,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    } catch (error: unknown) {
      throw this.#normalizeError(error);
    }
  }

  async executeStructured<T>(
    request: StructuredOutputRequest<T>,
    signal?: AbortSignal
  ): Promise<StructuredOutputResponse<T>> {
    const client = this.#requireClient();
    try {
      const response = await client.messages.create(
        mapAnthropicStructuredRequest(request),
        { signal }
      );
      const text = this.#extractText(response);
      return {
        data: request.schema.parse(JSON.parse(text) as unknown),
        rawResponse: response as unknown as Record<string, unknown>,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    } catch (error: unknown) {
      throw this.#normalizeError(error);
    }
  }

  #requireClient(): Anthropic {
    if (this.#client === null) {
      throw new ProviderError({
        code: 'anthropic_not_configured',
        details: { message: 'Anthropic API key not configured' },
        retryable: false,
        status: 500,
      });
    }
    return this.#client;
  }

  #extractText(response: Anthropic.Messages.Message): string {
    const text = response.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
    if (text.length === 0) {
      throw new ProviderError({
        code: 'anthropic_empty_response',
        message: 'Anthropic returned no text content',
        retryable: true,
        status: 502,
      });
    }
    return text;
  }

  #normalizeError(error: unknown): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }
    if (error instanceof Anthropic.APIError) {
      const status = typeof error.status === 'number' ? error.status : 500;
      return new ProviderError({
        code: this.#resolveApiErrorCode(error),
        details: { message: error.message },
        retryable: status === 408 || status === 409 || status === 429 || status >= 500,
        status,
      });
    }
    const message = error instanceof Error ? error.message : 'unknown';
    return new ProviderError({
      code: 'anthropic_sdk_failure',
      details: { message },
      retryable: false,
      status: 502,
    });
  }

  #resolveApiErrorCode(error: { error?: unknown }): string {
    const details = error.error;
    if (
      details !== null && typeof details === 'object'
      && 'type' in details && typeof details.type === 'string'
    ) {
      return details.type;
    }
    return 'anthropic_error';
  }
}
