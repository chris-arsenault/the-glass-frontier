import { createOpsStore, type LlmBudgetReservation } from '@glass-frontier/ops';
import type { LoggableMetadata } from '@glass-frontier/utils';
import { isNonEmptyString, log } from '@glass-frontier/utils';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { Pool } from 'pg';
import { z, type ZodSchema } from 'zod';

import { createDefaultRegistry } from './modelRegistry';
import { ProviderError } from './ProviderError';
import type { IProvider } from './providers/IProvider';
import type {
  IStructuredOutputProvider,
  StructuredOutputRequest,
  StructuredOutputResponse,
} from './providers/IStructuredOutputProvider';
import type { ProviderRegistry } from './providers/ProviderRegistry';
import { AuditArchive } from './services/AuditArchive';
import { LlmBudgetManager } from './services/LlmBudgetManager';
import { ModelUsageTracker } from './services/ModelUsageTracker';
import { LLMSuccessHandler } from './services/successHandler';
import { TokenUsageTracker } from './services/TokenUsageTracker';
import type { LLMRequest, LLMResponse } from './types';

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_DELAY_MS = 40;

export type LLMResponseFormat = 'string' | 'json';
export type CreateLLMClientOptions = { pool?: Pool };

type StructuredAttempt<T> = {
  request: LLMRequest;
  schema: ZodSchema<T>;
  schemaName: string;
  requestId: string;
  attempt: number;
};

const stripMarkdownCodeFence = (text: string): string => text
  .replace(/^```(?:json)?\s*\n?/i, '')
  .replace(/\n?```\s*$/i, '')
  .trim();

const withTimeout = async <T>(
  handler: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await handler(controller.signal);
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

const isStructuredProvider = (
  provider: IProvider
): provider is IProvider & IStructuredOutputProvider =>
  'executeStructured' in provider && typeof provider.executeStructured === 'function';

export function createLLMClient(options?: CreateLLMClientOptions): RetryLLMClient {
  const registry = createDefaultRegistry();
  const pool = options?.pool;
  const auditArchive = pool === undefined ? AuditArchive.fromEnv() : new AuditArchive({ pool });
  const tokenUsageTracker = pool === undefined
    ? TokenUsageTracker.fromEnv()
    : new TokenUsageTracker({ pool });
  const modelUsageTracker = pool === undefined
    ? ModelUsageTracker.fromEnv()
    : new ModelUsageTracker({ pool });
  const budgetStore = createOpsStore(pool === undefined ? undefined : { pool }).llmBudgetStore;
  return new RetryLLMClient({
    budgetManager: new LlmBudgetManager({ store: budgetStore }),
    registry,
    successHandler: new LLMSuccessHandler({
      auditArchive,
      modelUsageTracker,
      tokenUsageTracker,
    }),
  });
}

export class RetryLLMClient {
  readonly #budgetManager: LlmBudgetManager;
  readonly #registry: ProviderRegistry;
  readonly #successHandler: LLMSuccessHandler;

  constructor(options: {
    budgetManager: LlmBudgetManager;
    registry: ProviderRegistry;
    successHandler: LLMSuccessHandler;
  }) {
    this.#budgetManager = options.budgetManager;
    this.#registry = options.registry;
    this.#successHandler = options.successHandler;
  }

  async generate(
    request: LLMRequest,
    format: LLMResponseFormat,
    requestId = '',
    attempt = 0
  ): Promise<LLMResponse> {
    const resolvedRequestId = this.#ensureRequestId(requestId);
    const response = await this.#execWithRetry(request, resolvedRequestId, attempt);
    try {
      const formatted = this.#formatResponse(response, format);
      await this.#successHandler.handleSuccess(formatted);
      return formatted;
    } catch (error: unknown) {
      this.#logError(error, attempt, request.metadata);
      if (attempt >= DEFAULT_MAX_RETRIES) {
        throw this.#toError(error);
      }
      return this.generate(request, format, resolvedRequestId, attempt + 1);
    }
  }

  async generateStructured<T>(
    request: LLMRequest,
    schema: ZodSchema<T>,
    schemaName: string,
    requestId = ''
  ): Promise<StructuredOutputResponse<T>> {
    return this.#generateStructuredAttempt({
      attempt: 0,
      request,
      requestId: this.#ensureRequestId(requestId),
      schema,
      schemaName,
    });
  }

  async #execWithRetry(
    request: LLMRequest,
    requestId: string,
    attempt: number
  ): Promise<LLMResponse> {
    try {
      return await withTimeout(async (signal) => {
        const { model, provider, request: resolvedRequest } = this.#registry.resolve(request);
        const reservation = await this.#budgetManager.reserve(request, model);
        const startTime = Date.now();
        const response = await this.#executeReserved(
          reservation,
          () => provider.execute(resolvedRequest, signal)
        );
        await this.#settleBudget(reservation, model, response.usage);
        return {
          attempts: attempt + 1,
          durationMs: Date.now() - startTime,
          message: response.output_text,
          metadata: request.metadata,
          providerId: provider.id,
          requestBody: request,
          requestId,
          responseBody: response.rawResponse,
          usage: response.usage,
        };
      });
    } catch (error: unknown) {
      return this.#retryRequest(error, request, requestId, attempt);
    }
  }

  async #retryRequest(
    error: unknown,
    request: LLMRequest,
    requestId: string,
    attempt: number
  ): Promise<LLMResponse> {
    this.#logError(error, attempt, request.metadata);
    if (error instanceof ProviderError && error.status === 400) {
      throw this.#createBadRequestError(error, request.model);
    }
    if (error instanceof ProviderError && !error.retryable) {
      throw error;
    }
    if (attempt >= DEFAULT_MAX_RETRIES) {
      throw this.#toError(error);
    }
    await delay(this.#retryDelay(attempt));
    return this.#execWithRetry(request, requestId, attempt + 1);
  }

  async #generateStructuredAttempt<T>(
    input: StructuredAttempt<T>
  ): Promise<StructuredOutputResponse<T>> {
    try {
      const response = await this.#execStructured(input);
      await this.#successHandler.handleSuccess({
        attempts: input.attempt + 1,
        durationMs: response.durationMs,
        message: response.result.data,
        metadata: input.request.metadata,
        providerId: response.providerId,
        requestBody: input.request,
        requestId: input.requestId,
        responseBody: response.result.rawResponse,
        usage: response.result.usage,
      });
      return response.result;
    } catch (error: unknown) {
      return this.#retryStructured(error, input);
    }
  }

  async #execStructured<T>(input: StructuredAttempt<T>): Promise<{
    durationMs: number;
    providerId: string;
    result: StructuredOutputResponse<T>;
  }> {
    return withTimeout(async (signal) => {
      const { model, provider, request: resolvedRequest } = this.#registry.resolve(input.request);
      if (!isStructuredProvider(provider)) {
        throw new Error(`Provider ${provider.id} does not support structured output`);
      }
      const request: StructuredOutputRequest<T> = {
        ...resolvedRequest,
        schema: input.schema,
        schemaName: input.schemaName,
      };
      const reservation = await this.#budgetManager.reserve(
        input.request,
        model,
        JSON.stringify({
          schema: z.toJSONSchema(input.schema),
          schemaName: input.schemaName,
        })
      );
      const startTime = Date.now();
      const result = await this.#executeReserved(
        reservation,
        () => provider.executeStructured<T>(request, signal)
      );
      await this.#settleBudget(reservation, model, result.usage);
      return { durationMs: Date.now() - startTime, providerId: provider.id, result };
    });
  }

  async #executeReserved<T>(
    reservation: LlmBudgetReservation,
    execute: () => Promise<T>
  ): Promise<T> {
    try {
      return await execute();
    } catch (error: unknown) {
      try {
        await this.#budgetManager.release(reservation);
      } catch (releaseError: unknown) {
        log('error', 'narrative.llm.budget_release_failed', {
          message: this.#toError(releaseError).message,
          reservationId: reservation.id,
        });
      }
      throw error;
    }
  }

  async #settleBudget(
    reservation: LlmBudgetReservation,
    model: ReturnType<ProviderRegistry['getModelConfig']>,
    usage: LLMResponse['usage']
  ): Promise<void> {
    try {
      await this.#budgetManager.settle(reservation, model, usage);
    } catch (error: unknown) {
      throw new ProviderError({
        code: 'llm_budget_accounting_failed',
        details: { message: this.#toError(error).message, reservationId: reservation.id },
        message: 'The model responded, but its budget charge could not be recorded.',
        retryable: false,
        status: 500,
      });
    }
  }

  async #retryStructured<T>(
    error: unknown,
    input: StructuredAttempt<T>
  ): Promise<StructuredOutputResponse<T>> {
    this.#logError(error, input.attempt, input.request.metadata);
    if (error instanceof ProviderError && error.status === 400) {
      throw this.#createBadRequestError(error, input.request.model);
    }
    if (error instanceof ProviderError && !error.retryable) {
      throw error;
    }
    if (input.attempt >= DEFAULT_MAX_RETRIES) {
      throw this.#toError(error);
    }
    await delay(this.#retryDelay(input.attempt));
    return this.#generateStructuredAttempt({ ...input, attempt: input.attempt + 1 });
  }

  #formatResponse(response: LLMResponse, format: LLMResponseFormat): LLMResponse {
    if (format !== 'json') {
      return response;
    }
    if (typeof response.message !== 'string') {
      throw new Error('JSON response body must be a string.');
    }
    const text = response.message.includes('```')
      ? stripMarkdownCodeFence(response.message)
      : response.message;
    return { ...response, message: JSON.parse(text) as unknown };
  }

  #ensureRequestId(requestId: string): string {
    return isNonEmptyString(requestId) ? requestId : randomUUID();
  }

  #retryDelay(attempt: number): number {
    return RETRY_DELAY_MS * (attempt + 1);
  }

  #logError(error: unknown, attempt: number, metadata: LoggableMetadata): void {
    log('error', 'narrative.llm.invoke_failed', {
      attempt,
      ...metadata,
      message: this.#toError(error).message,
    });
  }

  #toError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(typeof error === 'string' ? error : 'llm_invoke_failed');
  }

  #createBadRequestError(error: unknown, model: string): Error {
    return new Error(`llm_bad_request (${model}): ${this.#toError(error).message}`.slice(0, 500));
  }
}
