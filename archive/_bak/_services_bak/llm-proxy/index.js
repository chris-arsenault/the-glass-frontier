"use strict";

import express from "express";
import { log  } from "../../_src_bak/utils/logger.js";
import { createRouter  } from "./router.js";

const port = Number.parseInt(
  process.env.PORT || process.env.LLM_PROXY_PORT || "8082",
  10
);
const app = express();
const router = createRouter();

process.env.SERVICE_NAME = process.env.SERVICE_NAME || "llm-proxy";

app.use(
  express.json({
    limit: process.env.LLM_PROXY_BODY_LIMIT || "2mb"
  })
);

function resolvePrimaryProvider() {
  const configured = process.env.LLM_PROXY_PROVIDER;
  if (configured) {
    return configured;
  }

  const priority = process.env.LLM_PROXY_PROVIDER_PRIORITY;
  if (priority) {
    const first = priority.split(",").map((entry) => entry.trim()).find(Boolean);
    if (first) {
      return first;
    }
  }

  return "openai";
}

app.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    service: "llm-proxy",
    provider: resolvePrimaryProvider()
  });
});

app.post("/v1/chat/completions", async (req, res) => {
  try {
    await router.proxy({ req: req, res });
  } catch (error) {
    log("error", "LLM proxy request failed", {
      message: error.message
    });
    res.status(502).json({ error: "llm_proxy_failed", message: error.message });
  }
});

const server = app.listen(port, () => {
  log("info", "LLM proxy listening", { port });
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
