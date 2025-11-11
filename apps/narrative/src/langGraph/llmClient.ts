import { setTimeout as delay } from "node:timers/promises";
import { TRPCClientError, createTRPCUntypedClient, httpBatchLink } from "@trpc/client";
import type { TRPCUntypedClient } from "@trpc/client";
import { log } from "@glass-frontier/utils";

interface LlmInvokeOptions {
  prompt?: string;
  system?: string;
  messages?: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

interface ExecuteResult {
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
    this.#baseUrl = options?.baseUrl ?? process.env.LLM_PROXY_URL ?? "http://localhost:8082";
    this.#model = options?.model ?? "gpt-4.1-mini";
    this.#providerId = options?.providerId ?? "llm-proxy";
    this.#timeoutMs = Number.isFinite(options?.timeoutMs) && (options?.timeoutMs ?? 0) > 0 ? (options?.timeoutMs as number) : 45_000;
    this.#maxRetries = Number.isFinite(options?.maxRetries) && (options?.maxRetries ?? 0) >= 0 ? (options?.maxRetries as number) : 2;
    this.#defaultHeaders = options?.defaultHeaders ?? { "content-type": "application/json" };
    this.#client = createTRPCUntypedClient<any>({
      links: [
        httpBatchLink({
          url: this.#baseUrl,
          headers: () => this.#defaultHeaders
        })
      ]
    });
  }

  async generateText(options: LlmInvokeOptions): Promise<{ text: string; raw: unknown; usage: unknown; provider: string; attempts: number }> {
    const payload = this.#buildPayload(options);
    const { output, raw, usage, attempts } = await this.#execute({ body: payload, metadata: options.metadata });
    const text = Array.isArray(output) ? output.join("") : String(output ?? "");
    return { text, raw, usage, provider: this.#providerId, attempts };
  }

  async generateJson(options: LlmInvokeOptions): Promise<{ json: Record<string, unknown>; raw: unknown; usage: unknown; provider: string; attempts: number }> {
    const payload = this.#buildPayload(options);
    payload.response_format = { type: "json_object" };
    const { output, raw, usage, attempts } = await this.#execute({ body: payload, metadata: options.metadata });
    if (typeof output === "string") {
      const trimmed = output.trim();
      try {
        return {
          json: JSON.parse(trimmed),
          raw,
          usage,
          provider: this.#providerId,
          attempts
        };
      } catch (error) {
        throw new Error(`llm_json_parse_failed: ${error instanceof Error ? error.message : "unknown"}`);
      }
    }

    if (output && typeof output === "object") {
      return {
        json: output as Record<string, unknown>,
        raw,
        usage,
        provider: this.#providerId,
        attempts
      };
    }

    return { json: {}, raw, usage, provider: this.#providerId, attempts };
  }

  #buildPayload({ prompt, system, messages, temperature = 0.7, maxTokens = 450 }: LlmInvokeOptions): Record<string, unknown> {
    const sequence = Array.isArray(messages) ? [...messages] : [];

    if (system) {
      sequence.unshift({ role: "system", content: system });
    }

    if (prompt) {
      sequence.push({ role: "user", content: prompt });
    }

    if (sequence.length === 0) {
      throw new Error("llm_payload_requires_prompt_or_messages");
    }

    return {
      model: this.#model,
      messages: sequence,
      temperature,
      max_tokens: maxTokens,
      stream: false
    };
  }

  async #execute({
    body,
    metadata
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
        const parsed = (await this.#client.mutation("chatCompletion", body, {
          signal: controller.signal
        })) as Record<string, unknown>;

        clearTimeout(timer);
        const choice = Array.isArray(parsed.choices) ? parsed.choices[0] : undefined;
        const message = choice?.message?.content ?? choice?.delta?.content ?? "";

        return {
          output: message,
          raw: parsed,
          usage: parsed.usage ?? null,
          attempts: attempt + 1
        };
      } catch (error) {
        clearTimeout(timer);
        lastError = error;
        log("error", "narrative.llm.invoke_failed", {
          provider: this.#providerId,
          attempt,
          message: error instanceof Error ? error.message : "unknown",
          context: metadata ? JSON.stringify(metadata).slice(0, 200) : "{}"
        });

        if (error instanceof TRPCClientError && error.data?.httpStatus === 400) {
          const causeMessage =
            (error.cause as Error | undefined)?.message ?? error.message ?? "Downstream bad request.";
          throw new Error(
            `llm_bad_request (${this.#providerId}): ${causeMessage}`.slice(0, 500)
          );
        }

        if (attempt === this.#maxRetries) {
          throw error;
        }

        await delay(40 * (attempt + 1));
        attempt += 1;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("llm_invoke_failed");
  }
}

export { LangGraphLlmClient };
