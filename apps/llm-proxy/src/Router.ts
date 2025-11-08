"use strict";

import { log  } from "@glass-frontier/utils/";
import { ProviderRegistry, ProviderError, BaseProvider  } from "./providers";
import { Payload  } from "./Payload.js";
import {RequestHandler} from "express";
import {ProxyResponse} from "./ProxyResponse";

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
        return await provider.execute(
          payload,
          controller.signal,
        );
      } finally {
        clearTimeout(timer);
      }
    }

    return provider.execute(payload);
  }

  proxy: RequestHandler = async (req, res, next) => {
    const payload = new Payload(req.body);
    const proxyResponse = new ProxyResponse(res);
    const sequence = this.registry.providerOrder();

    if (sequence.length === 0) {
      log("error", "llm-proxy.no_providers_available");
      proxyResponse.sendJson(503, { error: "llm_proxy_no_providers" });
      return;
    }

    let lastError: ProviderError | undefined = undefined;

    for (let index = 0; index < sequence.length; index += 1) {
      const provider = sequence[index];
      const attempt = index + 1;
      const attemptCtx = {
        providerId: provider.id,
        attempt
      };

      try {
        log("info", "llm-proxy.provider.start", attemptCtx);
        const llmResponse = await this.executeProvider(provider, payload);
        proxyResponse.setLLMResponse(llmResponse);

        if (proxyResponse.isRetryable()) {
          log("warn", "llm-proxy.provider.retryable_status", {
            ...attemptCtx,
            status: proxyResponse.status
          });
          await proxyResponse.drain();
          lastError = new ProviderError({
            code: "llm_proxy_retryable_status",
            status: proxyResponse.status,
            retryable: true
          });
          continue;
        }
        log("info", "llm-proxy.provider.success", {
          ...attemptCtx,
          status: proxyResponse.status,
          stream: proxyResponse.shouldStream()
        });
        proxyResponse.returnToClient(req);

        return;
      } catch (error: any) {
        log("error", "llm-proxy.provider.failure", {
          ...attemptCtx,
          code: "llm_proxy_provider_failure",
          message: error.message
        });


        lastError = error;
      }
    }

    const status = lastError?.status || 502;
    proxyResponse.sendJson(status, {
      error: lastError?.code || "llm_proxy_all_providers_failed",
      message: lastError?.message || "All upstream providers failed"
    });
  }

}

export {
  Router
};