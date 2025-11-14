'use strict';

import OpenAI, { APIError } from 'openai';
import { Response } from 'undici';

import type { Payload } from '../Payload';
import { BaseProvider } from './BaseProvider';
import { ProviderError } from './ProviderError';

type ModelAdapter = (request: Record<string, unknown>, body: Record<string, unknown>) => void;
type ResponsesCreateParams = Parameters<OpenAI['responses']['create']>[0];
const defaultOpenAIEndpoint = 'https://api.openai.com/v1/responses';

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
      const tokens = extractMaxTokens(body);
      if (tokens !== undefined) {
        req.max_output_tokens = tokens;
      }
    },
  ],
  [
    'gpt-5-nano',
    (req, body) => {
      const tokens = extractMaxTokens(body);
      req.max_output_tokens = Math.max(tokens ?? 5000, 5000);
      delete req.temperature;
    },
  ],
]);

const DEFAULT_ADAPTER: ModelAdapter = (req, body) => {
  const tokens = extractMaxTokens(body);
  if (tokens !== undefined) {
    req.max_output_tokens = tokens;
  }
};

const extractMaxTokens = (body: Record<string, unknown>): number | undefined => {
  if (typeof body.max_output_tokens === 'number') {
    return body.max_output_tokens;
  }
  if (typeof body.max_tokens === 'number') {
    return body.max_tokens;
  }
  if (typeof body.max_completion_tokens === 'number') {
    return body.max_completion_tokens;
  }
  return undefined;
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
    return payload.sanitizePayload();
  }

  async execute(payload: Payload, signal?: AbortSignal): Promise<Response> {
    const body = payload.body as Record<string, unknown>;
    const input = this.buildInput(body);

    if (input.length === 0) {
      throw new ProviderError({
        code: 'openai_missing_input',
        details: { message: 'missing_input' },
        message: 'OpenAI responses require at least one input message.',
        retryable: false,
        status: 400,
      });
    }

    try {
      const request = this.#buildRequest(body, input);
      const completion = await this.#client.responses.create(request, {
        signal,
      });
      const normalized = this.#toChatCompletionPayload(completion);

      return new Response(JSON.stringify(normalized), {
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

  private buildInput(body: Record<string, unknown>): Array<Record<string, unknown>> {
    const rawMessages = body.messages;
    if (Array.isArray(rawMessages) && rawMessages.length > 0) {
      return rawMessages as Array<Record<string, unknown>>;
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
    input: Array<Record<string, unknown>>
  ): ResponsesCreateParams {
    const modelKey = typeof body.model === 'string' ? body.model : '';
    const request: ResponsesCreateParams = {
      input,
      model: modelKey,
      stream: false,
    };

    if (typeof body.temperature === 'number') {
      request.temperature = body.temperature;
    }
    if (body.reasoning !== undefined) {
      request.reasoning = body.reasoning;
    }
    if (body.text !== undefined) {
      request.text = body.text;
    }

    const adapter = MODEL_ADAPTERS.get(modelKey) ?? DEFAULT_ADAPTER;
    adapter(request, body);

    return request;
  }

  #toChatCompletionPayload(response: Record<string, unknown>): Record<string, unknown> {
    const text = this.#extractText(response);
    const usage = this.coerceRecord(response.usage);
    const stopReason = this.#extractStopReason(response);
    return {
      choices: [
        {
          finish_reason: stopReason,
          index: 0,
          message: { content: text, role: 'assistant' },
        },
      ],
      usage,
    };
  }

  #extractText(payload: Record<string, unknown>): string {
    const parts: string[] = [];
    parts.push(...this.#collectText(payload.output_text));
    if (parts.length == 0) {
      parts.push(...this.#collectText(payload.output));
    }
    return parts.join('').trim();
  }

  #collectText(source: unknown): string[] {
    if (Array.isArray(source)) {
      return source.flatMap((entry) => this.#collectTextFromEntry(entry));
    }
    if (typeof source === 'string') {
      return [source];
    }
    return [];
  }

  #collectTextFromEntry(entry: unknown): string[] {
    if (entry === null || typeof entry !== 'object') {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const parts: string[] = [];
    const text = record.text;
    if (typeof text === 'string') {
      parts.push(text);
    }
    const content = record.content;
    if (Array.isArray(content)) {
      for (const segment of content) {
        if (segment !== null && typeof segment === 'object') {
          const segText = (segment as Record<string, unknown>).text;
          if (typeof segText === 'string') {
            parts.push(segText);
          }
        }
      }
    }
    return parts;
  }

  #extractStopReason(payload: Record<string, unknown>): string {
    const candidate = payload.stop_reason;
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : 'stop';
  }
}

export { OpenAIProvider };
