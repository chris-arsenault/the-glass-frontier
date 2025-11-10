"use strict";

import { log } from "@glass-frontier/utils/";
import { ProviderRegistry, ProviderError, BaseProvider } from "./providers";
import { Payload } from "./Payload.js";
import { Response } from "undici";
import { z } from "zod";

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const chatMessageSchema = z.object({
  role: z.string(),
  content: z.any(),
  name: z.string().optional()
});

const chatCompletionInputSchema = z
  .object({
    model: z.string(),
    messages: z.array(chatMessageSchema).optional(),
    prompt: z.any().optional(),
    temperature: z.number().optional(),
    max_tokens: z.number().optional(),
    stream: z.boolean().optional(),
    requestId: z.string().optional(),
    provider: z.string().optional(),
    fallbackProviders: z.array(z.string()).optional()
  })
  .passthrough();

type ChatCompletionInput = z.infer<typeof chatCompletionInputSchema>;

class Router {
  registry: ProviderRegistry;
  timeoutMs: number;

  constructor() {
    this.timeoutMs = Number.parseInt(process.env.LLM_PROXY_REQUEST_TIMEOUT_MS || "60000", 10);
    this.registry = new ProviderRegistry();
  }

  async executeProvider(provider: BaseProvider, payload: Payload) {
    if (this.timeoutMs > 0 && Number.isFinite(this.timeoutMs)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        return await provider.execute(payload, controller.signal);
      } finally {
        clearTimeout(timer);
      }
    }

    return provider.execute(payload);
  }

  async proxy(body: ChatCompletionInput): Promise<unknown> {
    const payload = new Payload(body);
    const sequence = this.registry.providerOrder();

    if (sequence.length === 0) {
      throw new ProviderError({
        code: "llm_proxy_no_providers",
        status: 503,
        retryable: false
      });
    }

    let lastError: ProviderError | undefined;

    for (let index = 0; index < sequence.length; index += 1) {
      const provider = sequence[index];
      const attempt = index + 1;
      const attemptCtx = {
        providerId: provider.id,
        attempt
      };

      try {
        log("info", "llm-proxy.provider.start", attemptCtx);
        const preparedPayload = provider.preparePayload(payload);
        const llmResponse = await this.executeProvider(provider, preparedPayload);

        if (this.isRetryable(llmResponse)) {
          lastError = new ProviderError({
            code: "llm_proxy_retryable_status",
            status: llmResponse.status,
            retryable: true
          });
          await this.drain(llmResponse);
          log("warn", "llm-proxy.provider.retryable_status", {
            ...attemptCtx,
            status: llmResponse.status
          });
          continue;
        }

        if (!llmResponse.ok) {
          const errorBody = await this.readBody(llmResponse);
          lastError = new ProviderError({
            code: "llm_proxy_upstream_failure",
            status: llmResponse.status,
            retryable: false,
            details: { body: errorBody }
          });
          log("error", "llm-proxy.provider.failure_status", {
            ...attemptCtx,
            status: llmResponse.status
          });
          continue;
        }

        const responseBody = await this.readBody(llmResponse);
        log("info", "llm-proxy.provider.success", {
          ...attemptCtx,
          status: llmResponse.status
        });
        return responseBody;
      } catch (error: any) {
        log("error", "llm-proxy.provider.failure", {
          ...attemptCtx,
          code: "llm_proxy_provider_failure",
          message: error.message
        });
        lastError = error;
      }
    }

    throw (
      lastError ||
      new ProviderError({
        code: "llm_proxy_all_providers_failed",
        status: 502
      })
    );
  }

  private async readBody(response: Response): Promise<unknown> {
    if (response.status === 204 || response.status === 304) {
      return null;
    }

    const text = await response.text();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (_error) {
      return text;
    }
  }

  private async drain(response: Response) {
    if (!response.body) {
      return;
    }

    try {
      await response.arrayBuffer();
    } catch (_error) {
      // Ignore body stream errors while draining.
    }
  }

  private isRetryable(response: Response) {
    return RETRYABLE_STATUS.has(response.status);
  }
}

export { Router, chatCompletionInputSchema, type ChatCompletionInput };
