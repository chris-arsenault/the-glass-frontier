import OpenAI, { APIError } from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';

import { ProviderError } from '../ProviderError';
import type { LLMRequest } from '../types';
import type { IProvider, ProviderResponse } from './IProvider';
import type {
  IStructuredOutputProvider,
  StructuredOutputRequest,
  StructuredOutputResponse,
} from './IStructuredOutputProvider';

const sanitizeEnv = (value?: string): string => value?.trim() ?? '';

const describeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof APIError) {
    return {
      error: error.error,
      message: error.message,
      name: error.name,
      status: error.status,
    };
  }
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }
  return { error: String(error) };
};

export const mapOpenAIRequest = (
  request: LLMRequest
): OpenAI.Responses.ResponseCreateParamsNonStreaming => {
  const metadata = Object.fromEntries(
    Object.entries(request.metadata).map(([key, value]) => [key, String(value)])
  );
  return {
    input: request.input,
    instructions: request.instructions,
    max_output_tokens: request.maxOutputTokens,
    metadata,
    model: request.model,
    reasoning: { effort: request.reasoningEffort },
    stream: false,
  };
};

export const mapOpenAIStructuredRequest = <T>(
  request: StructuredOutputRequest<T>
): OpenAI.Responses.ResponseCreateParamsNonStreaming => {
  const { schema, schemaName, ...baseRequest } = request;
  return {
    ...mapOpenAIRequest(baseRequest),
    text: { format: zodTextFormat(schema, schemaName) },
  };
};

export class OpenAIProvider implements IProvider, IStructuredOutputProvider {
  readonly id = 'openai';
  readonly supportsStreaming = true;
  readonly valid: boolean;
  readonly #client: OpenAI | null = null;

  constructor() {
    const baseURL = sanitizeEnv(process.env.OPENAI_API_BASE);
    const apiKey = sanitizeEnv(process.env.OPENAI_API_KEY);
    if (apiKey.length === 0) {
      this.valid = false;
      return;
    }
    this.#client = new OpenAI({
      apiKey,
      ...(baseURL.length > 0 ? { baseURL } : {}),
    });
    this.valid = true;
  }

  async execute(request: LLMRequest, signal?: AbortSignal): Promise<ProviderResponse> {
    const client = this.#requireClient();
    try {
      const response = await client.responses.create(mapOpenAIRequest(request), { signal });
      return this.#mapResponse(response);
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
      const response = await client.responses.create(
        mapOpenAIStructuredRequest(request),
        { signal }
      );
      const data = request.schema.parse(JSON.parse(response.output_text) as unknown);
      return {
        data,
        rawResponse: response as unknown as Record<string, unknown>,
        usage: this.#mapStructuredUsage(response),
      };
    } catch (error: unknown) {
      console.error('[OpenAIProvider] Structured request failed:', describeError(error));
      throw this.#normalizeError(error);
    }
  }

  #requireClient(): OpenAI {
    if (this.#client === null) {
      throw new ProviderError({
        code: 'openai_not_configured',
        details: { message: 'OpenAI API key not configured' },
        retryable: false,
        status: 500,
      });
    }
    return this.#client;
  }

  #mapResponse(response: OpenAI.Responses.Response): ProviderResponse {
    return {
      output_text: response.output_text,
      rawResponse: response as unknown as Record<string, unknown>,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    };
  }

  #mapStructuredUsage(response: OpenAI.Responses.Response): StructuredOutputResponse['usage'] {
    return {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };
  }

  #normalizeError(error: unknown): ProviderError {
    if (error instanceof APIError) {
      const details = this.#coerceRecord(error.error);
      const type = this.#extractString(details, 'type') ?? 'openai_error';
      const message = this.#extractString(details, 'message') ?? error.message;
      const status = typeof error.status === 'number' ? error.status : 500;
      return new ProviderError({
        code: type,
        details,
        message,
        retryable: status === 408 || status === 409 || status === 429 || status >= 500,
        status,
      });
    }
    const message = error instanceof Error ? error.message : 'unknown';
    return new ProviderError({
      code: 'openai_sdk_failure',
      details: { message },
      retryable: false,
      status: 502,
    });
  }

  #coerceRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  #extractString(source: Record<string, unknown>, key: string): string | undefined {
    const value = new Map(Object.entries(source)).get(key);
    return typeof value === 'string' ? value : undefined;
  }
}
