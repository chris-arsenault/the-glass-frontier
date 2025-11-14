import type { AppRouter, ChatCompletionInput } from '@glass-frontier/llm-proxy';
import { log } from '@glass-frontier/utils';
import { TRPCClientError, createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { inferRouterProxyClient } from '@trpc/client';
import { randomUUID } from 'node:crypto';
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
const JSON_PARSE_RECOVERY_ATTEMPTS = 2;
const JSON_NESTED_PARSE_LIMIT = 3;
const JSON_WRAPPER_CHARS = new Set(['\'', '"', '`']);

type LlmInvokeOptions = {
  prompt?: string;
  system?: string;
  messages?: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  metadata?: InvocationMetadata;
  requestId?: string;
};

type ExecuteResult = {
  output: unknown;
  raw: ChatCompletionResponse;
  usage: unknown;
  attempts: number;
  requestId: string;
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

type LlmProxyClient = inferRouterProxyClient<AppRouter>;
type InvocationMetadata = NonNullable<ChatCompletionInput['metadata']>;

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
  readonly #client: LlmProxyClient;

  constructor(options?: LlmClientOptions) {
    this.#baseUrl = resolveBaseUrl(options?.baseUrl);
    this.#model = resolveModel(options?.model);
    this.#providerId = resolveProviderId(options?.providerId);
    this.#timeoutMs = resolveTimeout(options?.timeoutMs);
    this.#maxRetries = resolveMaxRetries(options?.maxRetries);
    this.#defaultHeaders = resolveHeaders(options?.defaultHeaders);
    this.#client = createTRPCProxyClient<AppRouter>({
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
  ): Promise<{
    text: string;
    raw: unknown;
    usage: unknown;
    provider: string;
    attempts: number;
    requestId: string;
  }> {
    const payload = this.#buildPayload(options);
    const { attempts, output, raw, requestId, usage } = await this.#execute({
      body: payload,
      metadata: options.metadata,
    });
    const text = Array.isArray(output) ? output.join('') : String(output ?? '');
    return { attempts, provider: this.#providerId, raw, requestId, text, usage };
  }

  async generateJson(options: LlmInvokeOptions): Promise<{
    json: Record<string, unknown>;
    raw: unknown;
    usage: unknown;
    provider: string;
    attempts: number;
    requestId: string;
  }> {
    const payload = { ...this.#buildPayload(options), response_format: { type: 'json_object' } };
    let totalAttempts = 0;
    let lastOutput: unknown;

    for (let parseAttempt = 0; parseAttempt <= JSON_PARSE_RECOVERY_ATTEMPTS; parseAttempt += 1) {
      // eslint-disable-next-line no-await-in-loop -- sequential retries depend on previous attempts
      const execution = await this.#execute({
        body: payload,
        metadata: options.metadata,
      });
      totalAttempts += execution.attempts;
      lastOutput = execution.output;

      const json = this.#coerceJsonResponse(execution.output);
      if (json !== null) {
        return {
          attempts: totalAttempts,
          json,
          provider: this.#providerId,
          raw: execution.raw,
          requestId: execution.requestId,
          usage: execution.usage,
        };
      }

      this.#logJsonParseFailure(parseAttempt, execution.output);
      if (parseAttempt === JSON_PARSE_RECOVERY_ATTEMPTS) {
        break;
      }
      // eslint-disable-next-line no-await-in-loop -- sequential retries depend on previous attempts
      await delay(this.#retryDelay(parseAttempt));
    }

    throw new Error(
      `llm_json_parse_failed (${this.#providerId}): ${this.#formatJsonFailurePreview(lastOutput)}`
    );
  }

  #buildPayload({
    maxTokens = 450,
    messages,
    prompt,
    requestId,
    system,
    temperature = 0.7,
  }: LlmInvokeOptions): ChatCompletionInput {
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
      requestId,
      stream: false,
      temperature,
    };
  }

  async #execute({
    body,
    metadata,
  }: {
    body: ChatCompletionInput;
    metadata?: InvocationMetadata;
  }): Promise<ExecuteResult> {
    const requestId = this.#ensureRequestId(body.requestId);
    const preparedBody = { ...body, requestId };
    return this.#attemptExecution(preparedBody, metadata, 0, requestId);
  }

  #mergeMetadata(body: ChatCompletionInput, metadata?: InvocationMetadata): ChatCompletionInput {
    if (metadata === undefined) {
      return { ...body };
    }
    return { ...body, metadata };
  }

  async #attemptExecution(
    body: ChatCompletionInput,
    metadata: InvocationMetadata | undefined,
    attempt: number,
    requestId: string
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
        requestId,
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
      return this.#attemptExecution(body, metadata, attempt + 1, requestId);
    } finally {
      clearTimeout(timer);
    }
  }

  async #invokeMutation(payload: ChatCompletionInput, signal: AbortSignal): Promise<unknown> {
    return this.#client.chatCompletion.mutate(payload, { signal });
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

  #coerceJsonResponse(output: unknown): Record<string, unknown> | null {
    const record = this.#coerceRecord(output);
    if (record !== null) {
      return record;
    }
    if (typeof output !== 'string') {
      return null;
    }
    return this.#coerceJsonFromString(output);
  }

  #coerceJsonFromString(value: string): Record<string, unknown> | null {
    const candidates = this.#buildJsonCandidates(value);
    for (const candidate of candidates) {
      const parsed = this.#parseNestedJson(candidate);
      if (parsed !== null) {
        return parsed;
      }
    }
    return null;
  }

  #buildJsonCandidates(value: string): string[] {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return [];
    }
    const candidates = new Set<string>();
    const withoutFence = this.#stripCodeFence(trimmed);
    const baseCandidates = [trimmed, withoutFence];
    for (const candidate of baseCandidates) {
      candidates.add(candidate);
      const unwrapped = this.#unwrapMatchingQuotes(candidate);
      candidates.add(unwrapped);
    }
    return Array.from(candidates).filter((candidate) => candidate.length > 0);
  }

  #stripCodeFence(value: string): string {
    const fence = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence !== null && fence[1] !== undefined) {
      return fence[1].trim();
    }
    return value;
  }

  #unwrapMatchingQuotes(value: string): string {
    if (value.length < 2) {
      return value;
    }
    const first = value.at(0);
    const last = value.at(-1);
    if (first !== undefined && first === last && JSON_WRAPPER_CHARS.has(first)) {
      return value.slice(1, -1).trim();
    }
    return value;
  }

  #parseNestedJson(value: string): Record<string, unknown> | null {
    let current = value;
    for (let depth = 0; depth < JSON_NESTED_PARSE_LIMIT; depth += 1) {
      const trimmed = current.trim();
      if (trimmed.length === 0) {
        return null;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return null;
      }

      const record = this.#coerceRecord(parsed);
      if (record !== null) {
        return record;
      }

      if (typeof parsed === 'string') {
        current = parsed;
        continue;
      }

      const arrayRecord = this.#coerceJsonFromArray(parsed);
      if (arrayRecord !== null) {
        return arrayRecord;
      }

      return null;
    }
    return null;
  }

  #coerceJsonFromArray(value: unknown): Record<string, unknown> | null {
    if (!Array.isArray(value)) {
      return null;
    }
    for (const entry of value) {
      const entryRecord = this.#coerceRecord(entry);
      if (entryRecord !== null) {
        return entryRecord;
      }
    }
    return null;
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

  #logJsonParseFailure(parseAttempt: number, output: unknown): void {
    log('warn', 'narrative.llm.json_parse_retry', {
      attempt: parseAttempt,
      preview: this.#formatJsonFailurePreview(output),
      provider: this.#providerId,
    });
  }

  #formatJsonFailurePreview(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim().slice(0, METADATA_MAX_CHARS);
    }
    if (value === undefined) {
      return 'undefined';
    }
    try {
      return JSON.stringify(value).slice(0, METADATA_MAX_CHARS);
    } catch {
      return '[unserializable]';
    }
  }

  #logError(error: unknown, attempt: number, metadata?: InvocationMetadata): void {
    log('error', 'narrative.llm.invoke_failed', {
      attempt,
      context: metadata !== undefined ? this.#stringifyMetadata(metadata) : '{}',
      message: this.#toError(error).message,
      provider: this.#providerId,
    });
  }

  #stringifyMetadata(metadata: InvocationMetadata): string {
    try {
      return JSON.stringify(metadata).slice(0, METADATA_MAX_CHARS);
    } catch {
      return '{}';
    }
  }

  #isBadRequest(error: unknown): error is TRPCClientError<AppRouter> {
    return error instanceof TRPCClientError && this.#extractHttpStatus(error) === 400;
  }

  #createBadRequestError(error: TRPCClientError<AppRouter>): Error {
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

  #extractHttpStatus(error: TRPCClientError<AppRouter>): number | null {
    const status = (error as { data?: { httpStatus?: unknown } }).data?.httpStatus;
    return typeof status === 'number' ? status : null;
  }

  #extractCauseMessage(error: TRPCClientError<AppRouter>): string {
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

  #ensureRequestId(value?: string): string {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
    return randomUUID();
  }
}

export { LangGraphLlmClient };
