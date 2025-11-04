"use strict";

const { Readable } = require("stream");
const { pipeline } = require("stream");
const { randomUUID } = require("crypto");
const { Response } = require("undici");
const { log } = require("../../src/utils/logger");
const { buildDefaultProviders } = require("./providers");
const { ProviderError } = require("./providers/providerError");
const { sanitizeBasePayload } = require("./payload");

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function normalizeId(id) {
  return typeof id === "string" ? id.trim().toLowerCase() : "";
}

function parseList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeId(entry)).filter(Boolean);
  }
  return value
    .split(",")
    .map((entry) => normalizeId(entry))
    .filter(Boolean);
}

function clonePayload(payload) {
  if (typeof structuredClone === "function") {
    return structuredClone(payload);
  }
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch (_error) {
    return { ...payload };
  }
}

function buildRegistry(providers) {
  const map = new Map();

  providers.forEach((provider) => {
    const id = normalizeId(provider.id);
    if (!id) {
      return;
    }
    map.set(id, provider);
    if (Array.isArray(provider.aliases)) {
      provider.aliases.forEach((alias) => {
        const normalized = normalizeId(alias);
        if (normalized && !map.has(normalized)) {
          map.set(normalized, provider);
        }
      });
    }
  });

  return {
    get(idOrAlias) {
      const key = normalizeId(idOrAlias);
      if (!key) {
        return null;
      }
      return map.get(key) || null;
    },
    listCanonical() {
      return Array.from(
        new Set(
          Array.from(map.entries())
            .filter(([, provider]) => provider && provider.id)
            .map(([, provider]) => normalizeId(provider.id))
        )
      );
    }
  };
}

function shouldStream(response) {
  if (!response || !(response instanceof Response)) {
    return false;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    return true;
  }

  return Boolean(response.headers.get("transfer-encoding")?.includes("chunked"));
}

async function drainResponse(response) {
  if (!response || !response.body) {
    return;
  }

  try {
    await response.arrayBuffer();
  } catch (_error) {
    // Nothing to do – body already errored.
  }
}

function sendJson(res, status, payload) {
  if (typeof res.status === "function") {
    res.status(status);
  } else {
    res.statusCode = status;
  }

  if (typeof res.json === "function") {
    res.json(payload);
  } else if (typeof res.send === "function") {
    res.send(JSON.stringify(payload));
  } else {
    res.end(JSON.stringify(payload));
  }
}

function pipeResponse(response, res) {
  if (!response) {
    sendJson(res, 502, { error: "llm_proxy_invalid_response" });
    return;
  }

  if (typeof res.status === "function") {
    res.status(response.status);
  } else {
    res.statusCode = response.status;
  }

  response.headers.forEach((value, key) => {
    if (typeof res.setHeader === "function") {
      res.setHeader(key, value);
    }
  });

  if (!response.body) {
    if (typeof res.end === "function") {
      res.end();
    }
    return;
  }

  const stream = Readable.fromWeb(response.body);
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  pipeline(stream, res, (error) => {
    if (error) {
      res.destroy(error);
    }
  });
}

function sendBuffered(response, res) {
  if (!response) {
    sendJson(res, 502, { error: "llm_proxy_invalid_response" });
    return;
  }

  if (typeof res.status === "function") {
    res.status(response.status);
  } else {
    res.statusCode = response.status;
  }

  response.headers.forEach((value, key) => {
    if (typeof res.setHeader === "function") {
      res.setHeader(key, value);
    }
  });

  response
    .arrayBuffer()
    .then((buffer) => {
      if (typeof res.send === "function") {
        res.send(Buffer.from(buffer));
      } else if (typeof res.end === "function") {
        res.end(Buffer.from(buffer));
      }
    })
    .catch((error) => {
      log("error", "llm-proxy.response.buffer_failed", { message: error.message });
      sendJson(res, 502, { error: "llm_proxy_stream_failed" });
    });
}

function isRetryableStatus(status) {
  return RETRYABLE_STATUS.has(status);
}

function toProviderSequence({ registry, overrideId, fallbackList, defaultOrder }) {
  const sequence = [];
  const seen = new Set();

  function pushCandidate(candidate) {
    if (!candidate) {
      return;
    }
    const provider = registry.get(candidate);
    if (!provider) {
      return;
    }
    const canonical = normalizeId(provider.id);
    if (!seen.has(canonical)) {
      seen.add(canonical);
      sequence.push(provider);
    }
  }

  pushCandidate(overrideId);
  fallbackList.forEach((candidate) => pushCandidate(candidate));
  defaultOrder.forEach((candidate) => pushCandidate(candidate));

  return sequence;
}

function buildFallbackList(bodyFallbacks, envFallbacks) {
  const list = [];
  parseList(bodyFallbacks).forEach((entry) => list.push(entry));
  parseList(envFallbacks).forEach((entry) => list.push(entry));
  return list;
}

function createRouter(options = {}) {
  const providers = Array.isArray(options.providers)
    ? options.providers
    : buildDefaultProviders();
  const registry = buildRegistry(providers);
  const defaultOrder =
    parseList(options.defaultProviderOrder) || registry.listCanonical() || [];
  const allowFallback =
    typeof options.allowFallback === "boolean" ? options.allowFallback : true;
  const timeoutMs =
    typeof options.timeoutMs === "number"
      ? options.timeoutMs
      : Number.parseInt(process.env.LLM_PROXY_REQUEST_TIMEOUT_MS || "60000", 10);
  const logger =
    typeof options.logger === "function"
      ? options.logger
      : (level, message, metadata) => log(level, message, metadata);

  async function executeProvider(provider, payload, requestId) {
    if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await provider.execute({
          body: payload,
          signal: controller.signal,
          requestId
        });
      } finally {
        clearTimeout(timer);
      }
    }

    return provider.execute({ body: payload, signal: undefined, requestId });
  }

  function toPayload(provider, sanitized) {
    const base = clonePayload(sanitized);
    if (typeof provider.preparePayload === "function") {
      return provider.preparePayload(base);
    }
    return base;
  }

  async function proxy({ body, res }) {
    const requestId = randomUUID();
    const sanitized = sanitizeBasePayload(body);
    const overrideId = body?.provider || process.env.LLM_PROXY_PROVIDER;
    const fallbackList = buildFallbackList(body?.fallbackProviders, process.env.LLM_PROXY_FALLBACK_PROVIDERS);
    const sequence = toProviderSequence({
      registry,
      overrideId,
      fallbackList,
      defaultOrder
    });

    if (sequence.length === 0) {
      logger("error", "llm-proxy.no_providers_available", { requestId });
      sendJson(res, 503, { error: "llm_proxy_no_providers" });
      return;
    }

    let lastError = null;

    for (let index = 0; index < sequence.length; index += 1) {
      const provider = sequence[index];
      const payload = toPayload(provider, sanitized);
      const attempt = index + 1;
      const attemptCtx = {
        providerId: provider.id,
        requestId,
        attempt
      };

      try {
        logger("info", "llm-proxy.provider.start", attemptCtx);
        const response = await executeProvider(provider, payload, requestId);

        if (!(response instanceof Response)) {
          throw new ProviderError({
            code: "llm_proxy_invalid_response",
            status: 502,
            retryable: allowFallback && attempt < sequence.length
          });
        }

        if (isRetryableStatus(response.status) && allowFallback && attempt < sequence.length) {
          logger("warn", "llm-proxy.provider.retryable_status", {
            ...attemptCtx,
            status: response.status
          });
          await drainResponse(response);
          lastError = new ProviderError({
            code: "llm_proxy_retryable_status",
            status: response.status,
            retryable: true
          });
          continue;
        }

        logger("info", "llm-proxy.provider.success", {
          ...attemptCtx,
          status: response.status
        });

        if (shouldStream(response)) {
          pipeResponse(response, res);
        } else {
          sendBuffered(response, res);
        }
        return;
      } catch (error) {
        const providerError =
          error instanceof ProviderError
            ? error
            : new ProviderError({
                code: "llm_proxy_provider_failure",
                message: error.message,
                retryable: allowFallback && attempt < sequence.length
              });

        logger(providerError.retryable ? "warn" : "error", "llm-proxy.provider.failure", {
          ...attemptCtx,
          code: providerError.code,
          message: providerError.message
        });

        if (!providerError.retryable || attempt === sequence.length) {
          const status = providerError.status || 502;
          sendJson(res, status, {
            error: providerError.code,
            message: providerError.message
          });
          return;
        }

        lastError = providerError;
      }
    }

    const status = lastError?.status || 502;
    sendJson(res, status, {
      error: lastError?.code || "llm_proxy_all_providers_failed",
      message: lastError?.message || "All upstream providers failed"
    });
  }

  return {
    proxy
  };
}

module.exports = {
  createRouter
};
