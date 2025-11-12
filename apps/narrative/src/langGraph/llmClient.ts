import { log } from '@glass-frontier/utils';
import { TRPCClientError, createTRPCUntypedClient, httpBatchLink } from '@trpc/client';
import type { TRPCUntypedClient } from '@trpc/client';
import { setTimeout as delay } from 'node:timers/promises';

type LlmInvokeOptions = {
  prompt?: string;
  system?: string;
  messages?: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

type ExecuteResult = {
  output: unknown;
  raw: unknown;
  usage: unknown;
  attempts: number;
}

class LangGraphLlmClient {
  readonly #baseUrl: string;
  readonly #model: string;
  readonly #providerId: string;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #defaultHeaders: Record<string, string>;
  readonly #client: TRPCUntypedClient<any>;

  constructor(options?: {
    baseUrl?: string;
    model?: string;
    providerId?: string;
    timeoutMs?: number;
    maxRetries?: number;
    defaultHeaders?: Record<string, string>;
  }) {
    const resolvedBaseUrl =
      options?.baseUrl ?? process.env.LLM_PROXY_URL ?? 'http://localhost:8082';
    this.#baseUrl = this.#normalizeBaseUrl(resolvedBaseUrl);
    this.#model = options?.model ?? 'gpt-4.1-mini';
    this.#providerId = options?.providerId ?? 'llm-proxy';
    this.#timeoutMs =
      Number.isFinite(options?.timeoutMs) && (options?.timeoutMs ?? 0) > 0
        ? (options?.timeoutMs as number)
        : 45_000;
    this.#maxRetries =
      Number.isFinite(options?.maxRetries) && (options?.maxRetries ?? 0) >= 0
        ? (options?.maxRetries as number)
        : 2;
    this.#defaultHeaders = options?.defaultHeaders ?? { 'content-type': 'application/json' };
    this.#client = createTRPCUntypedClient<any>({
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
    const payload = this.#buildPayload(options);
    payload.response_format = { type: 'json_object' };
    const { attempts, output, raw, usage } = await this.#execute({
      body: payload,
      metadata: options.metadata,
    });
    if (typeof output === 'string') {
      const trimmed = output.trim();
      try {
        return {
          attempts,
          json: JSON.parse(trimmed),
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

    if (output && typeof output === 'object') {
      return {
        attempts,
        json: output as Record<string, unknown>,
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

    if (system) {
      sequence.unshift({ content: system, role: 'system' });
    }

    if (prompt) {
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
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.#maxRetries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
      try {
        const payload = metadata ? { ...body, metadata } : body;
        const parsed = (await this.#client.mutation('chatCompletion', payload, {
          signal: controller.signal,
        })) as Record<string, unknown>;

        clearTimeout(timer);
        const choice = Array.isArray(parsed.choices) ? parsed.choices[0] : undefined;
        const message = choice?.message?.content ?? choice?.delta?.content ?? '';

        return {
          attempts: attempt + 1,
          output: message,
          raw: parsed,
          usage: parsed.usage ?? null,
        };
      } catch (error) {
        clearTimeout(timer);
        lastError = error;
        log('error', 'narrative.llm.invoke_failed', {
          attempt,
          context: metadata ? JSON.stringify(metadata).slice(0, 200) : '{}',
          message: error instanceof Error ? error.message : 'unknown',
          provider: this.#providerId,
        });

        if (error instanceof TRPCClientError && error.data?.httpStatus === 400) {
          const causeMessage =
            (error.cause)?.message ??
            error.message ??
            'Downstream bad request.';
          throw new Error(`llm_bad_request (${this.#providerId}): ${causeMessage}`.slice(0, 500));
        }

        if (attempt === this.#maxRetries) {
          throw error;
        }

        await delay(40 * (attempt + 1));
        attempt += 1;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('llm_invoke_failed');
  }

  #normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }
}

export { LangGraphLlmClient };
