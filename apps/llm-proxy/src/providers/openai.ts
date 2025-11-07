"use strict";

import { fetch  } from "undici.js";
import { ProviderError  } from "./providerError.js";
import { sanitizeBasePayload  } from "../payload.js";
import { log  } from "../../../_src_bak/utils/logger.js";

function createOpenAiProvider(options = {}) {
  const httpFetch = options.fetch || fetch;

  return {
    id: "openai",
    aliases: ["oai", "gpt", "gpt-4o", "gpt4", "openai-chat"],
    supportsStreaming: true,
    preparePayload: sanitizeBasePayload,
    async execute({ body, signal }) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new ProviderError({
          code: "openai_api_key_missing",
          status: 503,
          retryable: false
        });
      }
      // body['stream'] = true;

      const target =
        process.env.OPENAI_API_BASE || "https://api.openai.com/v1/chat/completions";

      try {
        const r =  await httpFetch(target, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
            "accept-encoding": "identity",
          },
          body: JSON.stringify(body),
          signal
        });
        const summary = {
          ok: r.ok,
          status: r.status,
          statusText: r.statusText,
          url: r.url,
          headers: Object.fromEntries(r.headers),
          bodyUsed: r.bodyUsed,
        };
        log("info", typeof r, {"loc": "typeof response_in_provider"})
        log("info", summary, {"loc": "response_in_provider"})
        return r;
      } catch (error) {
        throw new ProviderError({
          code: "openai_upstream_unreachable",
          message: error.message,
          status: 502,
          retryable: true
        });
      }
    }
  };
}

export {
  createOpenAiProvider
};
