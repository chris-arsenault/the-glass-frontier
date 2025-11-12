import { log } from '@glass-frontier/utils';
import { TRPCClientError, createTRPCUntypedClient, httpBatchLink } from '@trpc/client';
import type { TRPCUntypedClient } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_PROVIDER = 'llm-proxy';
const DEFAULT_BASE_URL = 'http://localhost:8082';
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_DELAY_MS = 40;
const METADATA_MAX_CHARS = 200;
const DEFAULT_HEADERS: Record<string, string> = { 'content-type': 'application/json' };

type LlmInvokeOptions = {
  prompt?: string;
  system?: string;
  messages?: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
};

type ExecuteResult = {
  output: unknown;
  raw: ChatCompletionResponse;
  usage: unknown;
  attempts: number;
};

type ChatCompletionMessage = {
  content?: string | string[] | null;
};

type ChatCompletionChoice = {
  delta?: ChatCompletionMessage | null;
  message?: ChatCompletionMessage | null;
};

type ChatCompletionResponse = {
  choices: ChatCompletionChoice[];
  usage: Record<string, unknown> | null;
};

type LlmClientOptions = {
  baseUrl?: string;
  model?: string;
  providerId?: string;
  timeoutMs?: number;
  maxRetries?: number;
  defaultHeaders?: Record<string, string>;
};

const resolveBaseUrl = (value?: string): string => {
  const candidate = [value, process.env.LLM_PROXY_URL, DEFAULT_BASE_URL].find(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0
  );
  return (candidate ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
};

const resolveModel = (value?: string): string =>
  typeof value === 'string' && value.length > 0 ? value : DEFAULT_MODEL;

const resolveProviderId = (value?: string): string =>
  typeof value === 'string' && value.length > 0 ? value : DEFAULT_PROVIDER;

const resolveTimeout = (value?: number): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return DEFAULT_TIMEOUT_MS;
};

const resolveMaxRetries = (value?: number): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return DEFAULT_MAX_RETRIES;
};

const resolveHeaders = (headers?: Record<string, string>): Record<string, string> => {
  if (headers !== undefined && Object.keys(headers).length > 0) {
    return { ...headers };
  }
  return { ...DEFAULT_HEADERS };
};

class LangGraphLlmClient {
  readonly #baseUrl: string;
  readonly #model: string;
  readonly #providerId: string;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #defaultHeaders: Record<string, string>;
  readonly #client: TRPCUntypedClient<AnyRouter>;

  constructor(options?: LlmClientOptions) {
    this.#baseUrl = resolveBaseUrl(options?.baseUrl);
    this.#model = resolveModel(options?.model);
    this.#providerId = resolveProviderId(options?.providerId);
    this.#timeoutMs = resolveTimeout(options?.timeoutMs);
    this.#maxRetries = resolveMaxRetries(options?.maxRetries);
    this.#defaultHeaders = resolveHeaders(options?.defaultHeaders);
    this.#client = createTRPCUntypedClient<AnyRouter>({
      links: [
        httpBatchLink({
          headers: () => this.#defaultHeaders,
          url: this.#baseUrl,
        }),
      ],
    });
  }

  async generateText(
    options: LlmInvokeOptions
  ): Promise<{ text: string; raw: unknown; usage: unknown; provider: string; attempts: number }> {
    const payload = this.#buildPayload(options);
    const { attempts, output, raw, usage } = await this.#execute({
      body: payload,
      metadata: options.metadata,
    });
    const text = Array.isArray(output) ? output.join('') : String(output ?? '');
    return { attempts, provider: this.#providerId, raw, text, usage };
  }

  async generateJson(options: LlmInvokeOptions): Promise<{
    json: Record<string, unknown>;
    raw: unknown;
    usage: unknown;
    provider: string;
    attempts: number;
  }> {
    const payload = { ...this.#buildPayload(options), response_format: { type: 'json_object' } };
    const { attempts, output, raw, usage } = await this.#execute({
      body: payload,
      metadata: options.metadata,
    });
    if (typeof output === 'string') {
      const trimmed = output.trim();
      try {
        const parsed = this.#coerceRecord(JSON.parse(trimmed)) ?? {};
        return {
          attempts,
          json: parsed,
          provider: this.#providerId,
          raw,
          usage,
        };
      } catch (error) {
        throw new Error(
          `llm_json_parse_failed: ${error instanceof Error ? error.message : 'unknown'}`
        );
      }
    }

    const coerced = this.#coerceRecord(output);
    if (coerced !== null) {
      return {
        attempts,
        json: coerced,
        provider: this.#providerId,
        raw,
        usage,
      };
    }

    return { attempts, json: {}, provider: this.#providerId, raw, usage };
  }

  #buildPayload({
    maxTokens = 450,
    messages,
    prompt,
    system,
    temperature = 0.7,
  }: LlmInvokeOptions): Record<string, unknown> {
    const sequence = Array.isArray(messages) ? [...messages] : [];

    if (typeof system === 'string' && system.length > 0) {
      sequence.unshift({ content: system, role: 'system' });
    }

    if (typeof prompt === 'string' && prompt.length > 0) {
      sequence.push({ content: prompt, role: 'user' });
    }

    if (sequence.length === 0) {
      throw new Error('llm_payload_requires_prompt_or_messages');
    }

    return {
      max_tokens: maxTokens,
      messages: sequence,
      model: this.#model,
      stream: false,
      temperature,
    };
  }

  async #execute({
    body,
    metadata,
  }: {
    body: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<ExecuteResult> {
    return this.#attemptExecution(body, metadata, 0);
  }

  #mergeMetadata(
    body: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Record<string, unknown> {
    return metadata === undefined ? { ...body } : { ...body, metadata };
  }

  async #attemptExecution(
    body: Record<string, unknown>,
    metadata: Record<string, unknown> | undefined,
    attempt: number
  ): Promise<ExecuteResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const mergedBody = this.#mergeMetadata(body, metadata);
      const response = await this.#invokeMutation(mergedBody, controller.signal);
      const parsed = this.#parseResponse(response);
      const message = this.#extractMessage(parsed.choices[0]);

      return {
        attempts: attempt + 1,
        output: message,
        raw: parsed,
        usage: parsed.usage ?? null,
      };
    } catch (error) {
      this.#logError(error, attempt, metadata);

      if (this.#isBadRequest(error)) {
        throw this.#createBadRequestError(error);
      }

      if (attempt >= this.#maxRetries) {
        throw this.#toError(error);
      }

      await delay(this.#retryDelay(attempt));
      return this.#attemptExecution(body, metadata, attempt + 1);
    } finally {
      clearTimeout(timer);
    }
  }

  async #invokeMutation(payload: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    return this.#client.mutation('chatCompletion', payload, { signal });
  }

  #parseResponse(payload: unknown): ChatCompletionResponse {
    if (payload === null || typeof payload !== 'object') {
      throw new Error('llm_invalid_response');
    }
    const record = payload as Record<string, unknown>;
    const choicesValue = record.choices;
    const choices = Array.isArray(choicesValue)
      ? choicesValue.filter((choice): choice is ChatCompletionChoice => this.#isChoice(choice))
      : [];
    const usage = this.#coerceRecord(record.usage);
    return { choices, usage };
  }

  #isChoice(value: unknown): value is ChatCompletionChoice {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  #extractMessage(choice?: ChatCompletionChoice): string {
    if (choice === undefined || choice === null) {
      return '';
    }
    const raw = choice.message?.content ?? choice.delta?.content ?? '';
    if (Array.isArray(raw)) {
      return raw.map((segment) => this.#stringifySegment(segment)).join('');
    }
    return this.#stringifySegment(raw);
  }

  #stringifySegment(segment: unknown): string {
    if (typeof segment === 'string') {
      return segment;
    }
    if (
      segment !== null &&
      typeof segment === 'object' &&
      'text' in (segment as Record<string, unknown>)
    ) {
      const value = (segment as Record<string, unknown>).text;
      return typeof value === 'string' ? value : '';
    }
    return '';
  }

  #coerceRecord(value: unknown): Record<string, unknown> | null {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  #logError(error: unknown, attempt: number, metadata?: Record<string, unknown>): void {
    log('error', 'narrative.llm.invoke_failed', {
      attempt,
      context: metadata !== undefined ? this.#stringifyMetadata(metadata) : '{}',
      message: this.#toError(error).message,
      provider: this.#providerId,
    });
  }

  #stringifyMetadata(metadata: Record<string, unknown>): string {
    try {
      return JSON.stringify(metadata).slice(0, METADATA_MAX_CHARS);
    } catch {
      return '{}';
    }
  }

  #isBadRequest(error: unknown): error is TRPCClientError<AnyRouter> {
    return error instanceof TRPCClientError && this.#extractHttpStatus(error) === 400;
  }

  #createBadRequestError(error: TRPCClientError<AnyRouter>): Error {
    const causeMessage = this.#extractCauseMessage(error);
    return new Error(`llm_bad_request (${this.#providerId}): ${causeMessage}`.slice(0, 500));
  }

  #toError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(typeof error === 'string' ? error : 'llm_invoke_failed');
  }

  #retryDelay(attempt: number): number {
    return RETRY_DELAY_MS * (attempt + 1);
  }

  #extractHttpStatus(error: TRPCClientError<AnyRouter>): number | null {
    const status = (error as { data?: { httpStatus?: unknown } }).data?.httpStatus;
    return typeof status === 'number' ? status : null;
  }

  #extractCauseMessage(error: TRPCClientError<AnyRouter>): string {
    const cause =
      (error.cause as { message?: unknown } | undefined)?.message ??
      (error as { cause?: { message?: unknown } }).cause?.message;
    if (typeof cause === 'string') {
      const trimmed = cause.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
    return error.message.length > 0 ? error.message : 'Downstream bad request.';
  }
}

export { LangGraphLlmClient };
