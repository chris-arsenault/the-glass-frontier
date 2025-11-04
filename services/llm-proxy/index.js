"use strict";

const express = require("express");
const { fetch } = require("undici");
const { log } = require("../../src/utils/logger");

const port = Number.parseInt(
  process.env.PORT || process.env.LLM_PROXY_PORT || "8082",
  10
);
const app = express();

process.env.SERVICE_NAME = process.env.SERVICE_NAME || "llm-proxy";

app.use(
  express.json({
    limit: process.env.LLM_PROXY_BODY_LIMIT || "2mb"
  })
);

app.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    service: "llm-proxy",
    provider: process.env.LLM_PROXY_PROVIDER || "openai"
  });
});

app.post("/v1/chat/completions", async (req, res) => {
  const provider = (req.body?.provider || process.env.LLM_PROXY_PROVIDER || "openai")
    .toString()
    .toLowerCase();

  try {
    if (provider === "openai") {
      await forwardOpenAi(req.body, res);
      return;
    }

    if (provider === "anthropic") {
      await forwardAnthropic(req.body, res);
      return;
    }

    res.status(400).json({ error: "unknown_provider", provider });
  } catch (error) {
    log("error", "LLM proxy request failed", {
      provider,
      message: error.message
    });
    res.status(502).json({ error: "llm_proxy_failed", message: error.message });
  }
});

async function forwardOpenAi(body, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "openai_api_key_missing" });
    return;
  }

  const target =
    process.env.OPENAI_API_BASE || "https://api.openai.com/v1/chat/completions";
  const payload = sanitizePayload(body);
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  res.status(response.status);
  res.setHeader("content-type", response.headers.get("content-type") || "application/json");
  res.send(Buffer.from(await response.arrayBuffer()));
}

async function forwardAnthropic(body, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "anthropic_api_key_missing" });
    return;
  }

  const target =
    process.env.ANTHROPIC_API_BASE || "https://api.anthropic.com/v1/messages";
  const payload = sanitizePayload(body);
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01"
    },
    body: JSON.stringify(payload)
  });

  res.status(response.status);
  res.setHeader("content-type", response.headers.get("content-type") || "application/json");
  res.send(Buffer.from(await response.arrayBuffer()));
}

function sanitizePayload(body = {}) {
  const clone = { ...body };
  delete clone.provider;
  if (!clone.model && process.env.LLM_PROXY_DEFAULT_MODEL) {
    clone.model = process.env.LLM_PROXY_DEFAULT_MODEL;
  }
  return clone;
}

const server = app.listen(port, () => {
  log("info", "LLM proxy listening", { port });
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
