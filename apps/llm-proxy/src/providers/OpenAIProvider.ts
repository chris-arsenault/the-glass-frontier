'use strict';

import OpenAI, { APIError } from 'openai';
import type {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { Response } from 'undici';

import type { Payload } from '../Payload';
import { BaseProvider } from './BaseProvider';
import { ProviderError } from './ProviderError';

type ModelAdapter = (request: Record<string, unknown>, body: Record<string, unknown>) => void;
const defaultOpenAIEndpoint = 'https://api.openai.com/v1/chat/completions';

const sanitizeEnv = (value?: string): string =>
  typeof value === 'string' ? value.trim() : '';

const readEnvOrFallback = (value: string | undefined, fallback: string): string => {
  const sanitized = sanitizeEnv(value);
  return sanitized.length > 0 ? sanitized : fallback;
};

const MODEL_ADAPTERS = new Map<string, ModelAdapter>([
  [
    'gpt-4.1-mini',
    (req, body) => {
      const tokens =
        typeof body.max_completion_tokens === 'number'
          ? body.max_completion_tokens
          : typeof body.max_tokens === 'number'
            ? body.max_tokens
            : undefined;
      if (tokens !== undefined) {
        req.max_completion_tokens = tokens;
        delete req.max_tokens;
      }
    },
  ],
  [
    'gpt-5-nano',
    (req, body) => {
      const tokens =
        typeof body.max_completion_tokens === 'number'
          ? body.max_completion_tokens
          : typeof body.max_tokens === 'number'
            ? body.max_tokens
            : undefined;
      if (tokens !== undefined) {
        req.max_completion_tokens = tokens;
      }
      delete req.max_tokens;
      delete req.temperature;
    },
  ],
]);

const DEFAULT_ADAPTER: ModelAdapter = (req, body) => {
  if (typeof body.max_tokens === 'number') {
    req.max_tokens = body.max_tokens;
  } else if (typeof body.max_completion_tokens === 'number') {
    req.max_tokens = body.max_completion_tokens;
  }
};

class OpenAIProvider extends BaseProvider {
  readonly #client: OpenAI;

  constructor() {
    super();
    this.id = 'openai';
    this.aliases = ['oai', 'gpt', 'gpt-4o', 'gpt4', 'openai-chat'];
    this.supportsStreaming = true;

    this.target = readEnvOrFallback(process.env.OPENAI_API_BASE, defaultOpenAIEndpoint);
    this.apiKey = sanitizeEnv(process.env.OPENAI_API_KEY);

    if (this.apiKey.length === 0) {
      this.valid = false;
    }

    this.headers = {
      'accept-encoding': 'identity',
      authorization: `Bearer ${this.apiKey}`,
      'content-type': 'application/json',
    };

    const preferredClientBase = sanitizeEnv(process.env.OPENAI_CLIENT_BASE);
    const fallbackClientBase = sanitizeEnv(process.env.OPENAI_API_BASE);
    const clientBase = preferredClientBase.length > 0 ? preferredClientBase : fallbackClientBase;

    this.#client = new OpenAI({
      apiKey: this.apiKey.length > 0 ? this.apiKey : undefined,
      baseURL: clientBase.length > 0 ? clientBase : undefined,
    });
  }

  preparePayload(payload: Payload): Payload {
    const sanitized = payload.sanitizePayload();
    const body = sanitized.body;

    const hasMessages = Array.isArray(body.messages);
    const prompt = body.prompt;
    const promptValue = typeof prompt === 'string' ? prompt.trim() : '';

    if (!hasMessages && promptValue.length > 0) {
      body.messages = [{ content: promptValue, role: 'user' }];
      delete body.prompt;
    }

    return sanitized;
  }

  async execute(payload: Payload, signal?: AbortSignal): Promise<Response> {
    const body = payload.body as Record<string, unknown>;
    const messages = this.buildMessages(body);

    if (messages.length === 0) {
      throw new ProviderError({
        code: 'openai_missing_messages',
        details: { message: 'missing_messages' },
        message: 'OpenAI chat completions require at least one message.',
        retryable: false,
        status: 400,
      });
    }

    try {
      const completion = await this.#client.chat.completions.create(
        this.#buildRequest(body, messages),
        {
          signal,
        }
      );

      return new Response(JSON.stringify(completion), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    } catch (error: unknown) {
      const apiError = this.asApiError(error);
      if (apiError !== null) {
        throw this.normalizeApiError(apiError);
      }

      throw this.normalizeUnknownError(error);
    }
  }

  private buildMessages(body: Record<string, unknown>): ChatCompletionMessageParam[] {
    const rawMessages = body.messages;
    if (Array.isArray(rawMessages) && rawMessages.length > 0) {
      return rawMessages as ChatCompletionMessageParam[];
    }

    const prompt = body.prompt;
    if (typeof prompt === 'string') {
      const trimmed = prompt.trim();
      if (trimmed.length > 0) {
        return [{ content: trimmed, role: 'user' }];
      }
    }

    return [];
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
      retryable: error.status >= 500,
      status: error.status,
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

  #buildRequest(
    body: Record<string, unknown>,
    messages: ChatCompletionMessageParam[]
  ): ChatCompletionCreateParams {
    const modelKey = typeof body.model === 'string' ? body.model : '';
    const request: Record<string, unknown> = {
      messages,
      model: modelKey,
      stream: false,
    };

    if (typeof body.temperature === 'number') {
      request.temperature = body.temperature;
    }

    const adapter = MODEL_ADAPTERS.get(modelKey) ?? DEFAULT_ADAPTER;
    adapter(request, body);

    return request as ChatCompletionCreateParams;
  }
}

export { OpenAIProvider };
