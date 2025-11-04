"use strict";

const { fetch } = require("undici");
const { ProviderError } = require("./providerError");
const { sanitizeBasePayload } = require("../payload");

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

      const target =
        process.env.OPENAI_API_BASE || "https://api.openai.com/v1/chat/completions";

      try {
        return await httpFetch(target, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify(body),
          signal
        });
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

module.exports = {
  createOpenAiProvider
};
