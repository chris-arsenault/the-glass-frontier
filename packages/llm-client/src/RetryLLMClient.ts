import { OpenAIProvider } from "./OpenAIProvider";
import { LLMRequest, LLMResponse } from "./types";
import { setTimeout } from "timers/promises";
import {isNonEmptyString, log, LoggableMetadata} from "@glass-frontier/utils";

import { LLMSuccessHandler } from "./services/successHandler";
import {AuditArchive} from "@glass-frontier/llm-client/services/AuditArchive";
import {TokenUsageTracker} from "@glass-frontier/llm-client/services/TokenUsageTracker";
import {randomUUID} from "node:crypto";

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_DELAY_MS = 40;
const JSON_PARSE_RECOVERY_ATTEMPTS = 2;
const JSON_NESTED_PARSE_LIMIT = 3;
const JSON_WRAPPER_CHARS = new Set(['\'', '"', '`']);

export type LLMResponseFormat = 'string' | 'json'
export function createLLMClient() {
  const auditArchive = AuditArchive.fromEnv();
  const tokenUsageTracker = TokenUsageTracker.fromEnv();
  const successHandler = new LLMSuccessHandler({auditArchive, tokenUsageTracker})
  return new RetryLLMClient({successHandler});
}

export class RetryLLMClient {
  readonly #provider: OpenAIProvider;
  readonly #successHandler: LLMSuccessHandler;

  constructor(options: { successHandler: LLMSuccessHandler }) {
    this.#provider = new OpenAIProvider();
    this.#successHandler = options.successHandler;
  }

  async generate(request: LLMRequest, format: LLMResponseFormat, requestId: string = "", attempt: number = 0): Promise<LLMResponse> {
    requestId = this.#ensureRequestId(requestId);
    const response = await this.#execWithRetry(request, requestId,  attempt);
    try {
      if (format === 'json') {
        response.message = JSON.parse(response.message);
      }
      console.log("final response")
      console.log(response)
      console.log("final response")
      await this.#successHandler.handleSuccess(response);
      return response;
    } catch(error) {
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

  async #execWithRetry(request: LLMRequest, requestId: string, attempt: number): Promise<LLMResponse> {
    const controller = new AbortController();
    setTimeout(DEFAULT_TIMEOUT_MS, () => controller.abort());
    try {
      const response = await this.#provider.execute(request, controller.signal);
      console.log(response)
      const record = response as Record<string, unknown>;
      console.log(record)
      const usage = record.usage as Record<string, any> ?? {};
      console.log(usage)
      const message = record.output_text;

      return {
        attempts: attempt + 1,
        message,
        record,
        requestId,
        usage
      };
    } catch (error) {
      this.#logError(error, attempt, request.metadata);

      if (this.#isBadRequest(error)) {
        throw this.#createBadRequestError(error);
      }

      if (attempt >= DEFAULT_MAX_RETRIES) {
        throw this.#toError(error);
      }

      await setTimeout(this.#retryDelay(attempt));
      return this.#execWithRetry(request, requestId, attempt + 1);
    }
  }

  //ERROR
  #retryDelay(attempt: number): number {
    return RETRY_DELAY_MS * (attempt + 1);
  }

  #logError(error: unknown, attempt: number, metadata: LoggableMetadata): void {
    log('error', 'narrative.llm.invoke_failed', {
      attempt,
      ...metadata,
      message: this.#toError(error).message,
      provider: this.#provider.id,
    });
  }

  #toError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(typeof error === 'string' ? error : 'llm_invoke_failed');
  }

  #isBadRequest(error: unknown) {
    return error?.status === 400;
  }

  #createBadRequestError(error: any): Error {
    return new Error(`llm_bad_request (${this.#provider.id}): ${error.message}`.slice(0, 500));
  }
}