import OpenAI, { APIError } from 'openai';
import { ProviderError } from './ProviderError';
import { LLMRequest } from "@glass-frontier/llm-client/types";

type ResponsesCreateParams = Parameters<OpenAI['responses']['create']>[0];
type ResponsesResponsePram = ReturnType<OpenAI['responses']['create']>;

const sanitizeEnv = (value?: string): string =>
  typeof value === 'string' ? value.trim() : '';


class OpenAIProvider {
  readonly #client: OpenAI;
  id: string;
  supportsStreaming: boolean;
  valid: boolean;

  constructor() {
    this.id = 'openai';
    this.supportsStreaming = true;

    const baseURL = sanitizeEnv(process.env.OPENAI_API_BASE);
    const apiKey = sanitizeEnv(process.env.OPENAI_API_KEY);

    if (apiKey.length === 0) {
      this.valid = false;
      return;
    }

    if (baseURL.length === 0) {
      this.valid = false;
      return;
    }

    this.#client = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL
    });
    this.valid = true;
  }

  async execute(request: LLMRequest, signal?: AbortSignal): Promise<ResponsesResponsePram> {

    try {
    //       const adapter = MODEL_ADAPTERS.get(modelKey) ?? DEFAULT_ADAPTER;
    // adapter(request as never, body);
     return await this.#client.responses.create(request, {
        signal,
      });
    } catch (error: unknown) {
      const apiError = this.asApiError(error);
      if (apiError !== null) {
        throw this.normalizeApiError(apiError);
      }

      throw this.normalizeUnknownError(error);
    }
  }

  private normalizeApiError(error: APIError): ProviderError {
    const rawDetails: unknown = (error as { error?: unknown }).error;
    const details = this.coerceRecord(rawDetails);
    const detailLookup = new Map<string, unknown>(Object.entries(details));
    const upstreamType = this.extractStringField(detailLookup, 'type') ?? 'openai_error';
    const upstreamMessage = this.extractStringField(detailLookup, 'message') ?? error.message;

    return new ProviderError({
      code: upstreamType,
      details,
      message: upstreamMessage,
      retryable: (error.status ?? 500) >= 500,
      status: error.status ?? 500,
    });
  }

  private normalizeUnknownError(error: unknown): ProviderError {
    const message = error instanceof Error ? error.message : 'unknown';
    return new ProviderError({
      code: 'openai_sdk_failure',
      details: { message },
      retryable: true,
      status: 502,
    });
  }

  private coerceRecord(value: unknown): Record<string, unknown> {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private extractStringField(source: Map<string, unknown>, key: string): string | undefined {
    if (!source.has(key)) {
      return undefined;
    }
    const value = source.get(key);
    return typeof value === 'string' ? value : undefined;
  }

  private asApiError(error: unknown): APIError | null {
    if (error instanceof APIError && typeof error.status === 'number') {
      return error;
    }
    return null;
  }
}

export { OpenAIProvider };
