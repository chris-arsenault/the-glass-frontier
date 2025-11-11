"use strict";

import { fetch  } from "undici";
import { log  } from "../../utils/logger.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

class LangGraphLlmClient {
  constructor({
    baseUrl = process.env.LANGGRAPH_LLM_ENDPOINT || process.env.LLM_PROXY_URL || "http://localhost:8082/v1/chat/completions",
    model = process.env.LANGGRAPH_LLM_MODEL || "gpt-4.1-mini",
    fetchImpl = fetch,
    providerId = process.env.LANGGRAPH_LLM_PROVIDER || "llm-proxy",
    timeoutMs = Number.parseInt(process.env.LANGGRAPH_LLM_TIMEOUT_MS || "45000", 10),
    maxRetries = Number.parseInt(process.env.LANGGRAPH_LLM_MAX_RETRIES || "2", 10),
    defaultHeaders = null
  } = {}) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.fetch = fetchImpl;
    this.providerId = providerId;
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 45000;
    this.maxRetries = Number.isFinite(maxRetries) && maxRetries >= 0 ? maxRetries : 2;
    this.defaultHeaders =
      defaultHeaders && isObject(defaultHeaders) ? { ...defaultHeaders } : { "content-type": "application/json" };
  }

  async generateText({ prompt, system, messages, temperature = 0.7, maxTokens = 450, metadata = {} } = {}) {
    const payload = this.#buildPayload({ prompt, system, messages, temperature, maxTokens });
    const { output, raw, usage, attempts } = await this.#execute({
      body: payload,
      metadata,
      responseFormat: null
    });

    const text = Array.isArray(output) ? output.join("") : String(output || "");
    return {
      text,
      raw,
      usage,
      provider: this.providerId,
      attempts
    };
  }

  async generateJson({ prompt, system, messages, temperature = 0.4, maxTokens = 800, metadata = {} } = {}) {
    const payload = this.#buildPayload({ prompt, system, messages, temperature, maxTokens });
    payload.response_format = { type: "json_object" };

    const { output, raw, usage, attempts } = await this.#execute({
      body: payload,
      metadata,
      responseFormat: "json_object"
    });

    let json = null;
    if (isObject(output)) {
      json = output;
    } else if (typeof output === "string" && output.trim().length > 0) {
      const trimmed = output.trim();
      const openIndex = trimmed.indexOf("{");
      const closeIndex = trimmed.lastIndexOf("}");
      const slice =
        openIndex >= 0 && closeIndex >= openIndex ? trimmed.slice(openIndex, closeIndex + 1) : trimmed;
      try {
        json = JSON.parse(slice);
      } catch (error) {
        throw new Error(`llm_json_parse_failed: ${error.message}`);
      }
    }

    return {
      json,
      raw,
      usage,
      provider: this.providerId,
      attempts
    };
  }

  #buildPayload({ prompt, system, messages, temperature, maxTokens }) {
    const sequence = Array.isArray(messages) ? [...messages] : [];

    if (typeof system === "string" && system.trim().length > 0) {
      sequence.unshift({ role: "system", content: system.trim() });
    }

    if (typeof prompt === "string" && prompt.trim().length > 0) {
      sequence.push({ role: "user", content: prompt });
    } else if (sequence.length === 0) {
      throw new Error("llm_payload_requires_prompt_or_messages");
    }

    return {
      model: this.model,
      messages: sequence,
      temperature,
      max_tokens: maxTokens,
      stream: false
    };
  }

  async #execute({ body, metadata, responseFormat }) {
    let attempt = 0;
    let lastError;

    while (attempt <= this.maxRetries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      log("info", body);
      try {
        const response = await this.fetch(this.baseUrl, {
          method: "POST",
          headers: this.defaultHeaders,
          body: JSON.stringify(body),
          signal: controller.signal
        });

        clearTimeout(timer);

        const text = await response.text();
        log("info", text, {"loc":"got_text"});
        if (!response.ok) {
          const details = text ? text.slice(0, 500) : response.statusText;
          throw new Error(`llm_http_${response.status}: ${details}`);
        }

        let parsed;
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch (error) {
          throw new Error(`llm_response_parse_failed: ${error.message}`);
        }

        const choice = Array.isArray(parsed.choices) ? parsed.choices[0] : null;
        const message = choice?.message?.content ?? choice?.delta?.content ?? "";
        const output = responseFormat === "json_object" ? message : message;
        return {
          output,
          raw: parsed,
          usage: parsed.usage || null,
          attempts: attempt + 1
        };
      } catch (error) {
        clearTimeout(timer);
        lastError = error;
        log("error", "narrative.llm.invoke_failed", {
          provider: this.providerId,
          attempt,
          message: error.message,
          metadata
        });

        if (attempt >= this.maxRetries) {
          throw error;
        }

        attempt += 1;
        await sleep(40 * attempt);
      }
    }

    throw lastError;
  }
}

function createLangGraphLlmClient(config) {
  return new LangGraphLlmClient(config);
}

export {
  LangGraphLlmClient,
  createLangGraphLlmClient
};
