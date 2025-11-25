import OpenAI, { APIError } from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { ProviderError } from '../ProviderError';
import { LLMRequest } from '../types';
import { IProvider, ProviderResponse } from './IProvider';
import {
  IStructuredOutputProvider,
  StructuredOutputRequest,
  StructuredOutputResponse,
} from './IStructuredOutputProvider';

const sanitizeEnv = (value?: string): string =>
  typeof value === 'string' ? value.trim() : '';

export class OpenAIProvider implements IProvider, IStructuredOutputProvider {
  readonly id = 'openai';
  readonly supportsStreaming = true;
  readonly supportsNativeStructuredOutput = true;
  readonly valid: boolean;
  readonly #client: OpenAI | null = null;

  constructor() {
    const baseURL = sanitizeEnv(process.env.OPENAI_API_BASE);
    const apiKey = sanitizeEnv(process.env.OPENAI_API_KEY);

    if (apiKey.length === 0 || baseURL.length === 0) {
      this.valid = false;
      return;
    }

    this.#client = new OpenAI({
      apiKey,
      baseURL,
    });
    this.valid = true;
  }

  async execute(request: LLMRequest, signal?: AbortSignal): Promise<ProviderResponse> {
    if (!this.#client) {
      throw new ProviderError({
        code: 'openai_not_configured',
        details: { message: 'OpenAI API key or base URL not configured' },
        retryable: false,
        status: 500,
      });
    }

    try {
      const response = await this.#client.responses.create(request, { signal });
      return this.#mapResponse(response);
    } catch (error: unknown) {
      const apiError = this.#asApiError(error);
      if (apiError !== null) {
        throw this.#normalizeApiError(apiError);
      }

      throw this.#normalizeUnknownError(error);
    }
  }

  #mapResponse(response: any): ProviderResponse {
    const usage = (response.usage as Record<string, any>) ?? {};
    const outputText = response.output_text ?? '';

    return {
      output_text: outputText,
      usage: {
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        ...usage,
      },
      rawResponse: response as Record<string, unknown>,
    };
  }

  async executeStructured<T>(
    request: StructuredOutputRequest,
    signal?: AbortSignal
  ): Promise<StructuredOutputResponse<T>> {
    if (!this.#client) {
      throw new ProviderError({
        code: 'openai_not_configured',
        details: { message: 'OpenAI API key or base URL not configured' },
        retryable: false,
        status: 500,
      });
    }

    try {
      // OpenAI has native structured output support via zodTextFormat
      // Exclude schema and schemaName from the request - they're not valid OpenAI params
      const { schema, schemaName, ...baseRequest } = request;
      const textFormat = zodTextFormat(schema, schemaName);

      const structuredRequest: LLMRequest = {
        ...baseRequest,
        text: {
          format: textFormat,
          verbosity: request.text.verbosity,
        },
      };

      const response = await this.#client.responses.create(structuredRequest, { signal });
      const jsonData = JSON.parse(response.output_text);
      const parsed = schema.parse(jsonData);

      return {
        data: parsed as T,
        rawResponse: response as unknown as Record<string, unknown>,
        usage: (response.usage as Record<string, unknown>) ?? {},
      };
    } catch (error: unknown) {
      console.error('[OpenAIProvider] Structured request failed:', JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : typeof error,
        stack: error instanceof Error ? error.stack : undefined,
        cause: error instanceof Error ? (error as any).cause : undefined,
        status: (error as any)?.status,
        code: (error as any)?.code,
        type: (error as any)?.type,
        error: (error as any)?.error,
        fullError: error,
      }, null, 2));
      const apiError = this.#asApiError(error);
      if (apiError !== null) {
        throw this.#normalizeApiError(apiError);
      }

      throw this.#normalizeUnknownError(error);
    }
  }

  #normalizeApiError(error: APIError): ProviderError {
    const rawDetails: unknown = (error as { error?: unknown }).error;
    const details = this.#coerceRecord(rawDetails);
    const detailLookup = new Map<string, unknown>(Object.entries(details));
    const upstreamType = this.#extractStringField(detailLookup, 'type') ?? 'openai_error';
    const upstreamMessage = this.#extractStringField(detailLookup, 'message') ?? error.message;

    return new ProviderError({
      code: upstreamType,
      details,
      message: upstreamMessage,
      retryable: (error.status ?? 500) >= 500,
      status: error.status ?? 500,
    });
  }

  #normalizeUnknownError(error: unknown): ProviderError {
    const message = error instanceof Error ? error.message : 'unknown';
    return new ProviderError({
      code: 'openai_sdk_failure',
      details: { message },
      retryable: true,
      status: 502,
    });
  }

  #coerceRecord(value: unknown): Record<string, unknown> {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  #extractStringField(source: Map<string, unknown>, key: string): string | undefined {
    if (!source.has(key)) {
      return undefined;
    }
    const value = source.get(key);
    return typeof value === 'string' ? value : undefined;
  }

  #asApiError(error: unknown): APIError | null {
    if (error instanceof APIError && typeof error.status === 'number') {
      return error;
    }
    return null;
  }
}
