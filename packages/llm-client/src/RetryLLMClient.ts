import type { Pool } from 'pg';
import { LLMRequest, LLMResponse } from './types';
import { setTimeout } from 'timers/promises';
import { isNonEmptyString, log, LoggableMetadata } from '@glass-frontier/utils';
import type { ZodSchema } from 'zod';

import { LLMSuccessHandler } from './services/successHandler';
import { AuditArchive } from '@glass-frontier/llm-client/services/AuditArchive';
import { TokenUsageTracker } from '@glass-frontier/llm-client/services/TokenUsageTracker';
import { ModelUsageTracker } from './services/ModelUsageTracker';
import { randomUUID } from 'node:crypto';
import { ProviderRegistry } from './providers/ProviderRegistry';
import { createDefaultRegistry } from './modelRegistry';
import type {
  IStructuredOutputProvider,
  StructuredOutputRequest,
  StructuredOutputResponse,
} from './providers/IStructuredOutputProvider';

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_DELAY_MS = 40;

export type LLMResponseFormat = 'string' | 'json';

function stripMarkdownCodeFence(text: string): string {
  // Remove markdown code fences like ```json\n{...}\n``` or ```\n{...}\n```
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
}

export type CreateLLMClientOptions = {
  /** Pre-created pool for Lambda with IAM auth. If not provided, uses connection string from env. */
  pool?: Pool;
};

/**
 * Create an LLM client with audit/usage tracking.
 *
 * For local development: call with no arguments
 * For Lambda with IAM auth: pass the pre-created pool
 */
export function createLLMClient(options?: CreateLLMClientOptions) {
  const registry = createDefaultRegistry();

  // If pool is provided (Lambda), use it; otherwise use fromEnv() for local dev
  const auditArchive = options?.pool
    ? new AuditArchive({ pool: options.pool })
    : AuditArchive.fromEnv();
  const tokenUsageTracker = options?.pool
    ? new TokenUsageTracker({ pool: options.pool })
    : TokenUsageTracker.fromEnv();
  const modelUsageTracker = options?.pool
    ? new ModelUsageTracker({ pool: options.pool })
    : ModelUsageTracker.fromEnv();

  const successHandler = new LLMSuccessHandler({
    auditArchive,
    tokenUsageTracker,
    modelUsageTracker,
  });
  return new RetryLLMClient({ registry, successHandler });
}

export class RetryLLMClient {
  readonly #registry: ProviderRegistry;
  readonly #successHandler: LLMSuccessHandler;

  constructor(options: { registry: ProviderRegistry; successHandler: LLMSuccessHandler }) {
    this.#registry = options.registry;
    this.#successHandler = options.successHandler;
  }

  async generate(
    request: LLMRequest,
    format: LLMResponseFormat,
    requestId: string = '',
    attempt: number = 0
  ): Promise<LLMResponse> {
    requestId = this.#ensureRequestId(requestId);
    const response = await this.#execWithRetry(request, requestId, attempt);
    try {
      if (format === 'json') {
        let jsonString = response.message as string;

        // Strip markdown code fences if present (common with some providers)
        if (typeof jsonString === 'string' && jsonString.includes('```')) {
          const cleaned = stripMarkdownCodeFence(jsonString);
          jsonString = cleaned;
        }

        response.message = JSON.parse(jsonString);
      }

      await this.#successHandler.handleSuccess(response);
      return response;
    } catch (error) {
      console.error('[RetryLLMClient] Response processing failed:', {
        error: error instanceof Error ? error.message : String(error),
        format,
        messageType: typeof response.message,
        messagePreview: typeof response.message === 'string' ? response.message.substring(0, 100) : undefined,
      });
      this.#logError(error, attempt, request.metadata);

      if (attempt >= DEFAULT_MAX_RETRIES) {
        throw this.#toError(error);
      }

      return await this.generate(request, format, requestId, attempt + 1);
    }
  }

  #ensureRequestId(requestId: string): string {
    if (isNonEmptyString(requestId)) {
      return requestId;
    }
    return randomUUID();
  }

  async #execWithRetry(
    request: LLMRequest,
    requestId: string,
    attempt: number
  ): Promise<LLMResponse> {
    const controller = new AbortController();
    setTimeout(DEFAULT_TIMEOUT_MS, () => controller.abort());

    try {
      const provider = this.#registry.getProvider(request.model);
      // Resolve the API model ID (e.g., "claude-haiku-4.5" -> "claude-haiku-4-5-20251001")
      const apiModelId = this.#registry.getApiModelId(request.model);
      const resolvedRequest = { ...request, model: apiModelId };

      const startTime = Date.now();
      const response = await provider.execute(resolvedRequest, controller.signal);
      const durationMs = Date.now() - startTime;

      return {
        attempts: attempt + 1,
        durationMs,
        message: response.output_text,
        metadata: request.metadata,
        providerId: provider.id,
        requestBody: request,
        requestId,
        responseBody: response.rawResponse,
        usage: response.usage,
      };
    } catch (error) {
      console.error('[RetryLLMClient] Request failed:', {
        requestId,
        attempt,
        model: request.model,
        error: error instanceof Error ? error.message : String(error),
      });
      this.#logError(error, attempt, request.metadata);

      if (this.#isBadRequest(error)) {
        throw this.#createBadRequestError(error, request.model);
      }

      if (attempt >= DEFAULT_MAX_RETRIES) {
        console.error('[RetryLLMClient] Max retries reached, giving up');
        throw this.#toError(error);
      }

      await setTimeout(this.#retryDelay(attempt));
      return this.#execWithRetry(request, requestId, attempt + 1);
    }
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

  #isBadRequest(error: unknown): boolean {
    return (error as any)?.status === 400;
  }

  #createBadRequestError(error: any, model: string): Error {
    return new Error(`llm_bad_request (${model}): ${error.message}`.slice(0, 500));
  }

  async generateStructured<T>(
    request: LLMRequest,
    schema: ZodSchema<T>,
    schemaName: string,
    requestId: string = '',
    attempt: number = 0
  ): Promise<StructuredOutputResponse<T>> {
    requestId = this.#ensureRequestId(requestId);

    const controller = new AbortController();
    setTimeout(DEFAULT_TIMEOUT_MS, () => controller.abort());

    try {
      const provider = this.#registry.getProvider(request.model);

      // Check if provider supports structured output
      if (!('executeStructured' in provider)) {
        console.error('[RetryLLMClient] Provider does not support structured output:', provider.id);
        throw new Error(`Provider ${provider.id} does not support structured output`);
      }

      const structuredProvider = provider as unknown as IStructuredOutputProvider;
      // Resolve the API model ID (e.g., "claude-haiku-4.5" -> "claude-haiku-4-5-20251001")
      const apiModelId = this.#registry.getApiModelId(request.model);
      const structuredRequest: StructuredOutputRequest = {
        ...request,
        model: apiModelId,
        schema,
        schemaName,
      };

      const startTime = Date.now();
      const response = await structuredProvider.executeStructured<T>(
        structuredRequest,
        controller.signal
      );
      const durationMs = Date.now() - startTime;

      // Track usage for structured requests by converting to LLMResponse format
      const llmResponse: LLMResponse = {
        attempts: attempt + 1,
        durationMs,
        message: response.data,
        metadata: request.metadata,
        providerId: provider.id,
        requestBody: request,
        requestId,
        responseBody: response.rawResponse,
        usage: response.usage,
      };
      await this.#successHandler.handleSuccess(llmResponse);

      return response;
    } catch (error) {
      this.#logError(error, attempt, request.metadata);

      if (this.#isBadRequest(error)) {
        throw this.#createBadRequestError(error, request.model);
      }

      if (attempt >= DEFAULT_MAX_RETRIES) {
        console.error('[RetryLLMClient] Max retries reached for structured request');
        throw this.#toError(error);
      }

      await setTimeout(this.#retryDelay(attempt));
      return this.generateStructured(request, schema, schemaName, requestId, attempt + 1);
    }
  }
}
