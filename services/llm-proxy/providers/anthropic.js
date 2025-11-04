"use strict";

const { fetch } = require("undici");
const { ProviderError } = require("./providerError");
const { sanitizeBasePayload } = require("../payload");

function createAnthropicProvider(options = {}) {
  const httpFetch = options.fetch || fetch;

  return {
    id: "anthropic",
    aliases: ["claude", "claude-3", "anthropic-messages"],
    supportsStreaming: true,
    preparePayload(payload) {
      const base = sanitizeBasePayload(payload);
      if (!base.messages && base.prompt) {
        base.messages = [
          {
            role: "user",
            content: base.prompt
          }
        ];
        delete base.prompt;
      }

      return base;
    },
    async execute({ body, signal }) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new ProviderError({
          code: "anthropic_api_key_missing",
          status: 503,
          retryable: false
        });
      }

      const target =
        process.env.ANTHROPIC_API_BASE || "https://api.anthropic.com/v1/messages";
      const version = process.env.ANTHROPIC_VERSION || "2023-06-01";
      const beta = process.env.ANTHROPIC_BETA;

      const headers = {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": version
      };

      if (beta) {
        headers["anthropic-beta"] = beta;
      }

      try {
        return await httpFetch(target, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal
        });
      } catch (error) {
        throw new ProviderError({
          code: "anthropic_upstream_unreachable",
          message: error.message,
          status: 502,
          retryable: true
        });
      }
    }
  };
}

module.exports = {
  createAnthropicProvider
};
