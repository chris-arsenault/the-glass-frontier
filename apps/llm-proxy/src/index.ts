"use strict";

import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { initTRPC, TRPCError } from "@trpc/server";
import http from "node:http";
import { log } from "@glass-frontier/utils";
import { Router, chatCompletionInputSchema } from "./Router";
import { ProviderError } from "./providers";

const port = Number.parseInt(process.env.PORT || process.env.LLM_PROXY_PORT || "8082", 10);
const routerService = new Router();
process.env.SERVICE_NAME = process.env.SERVICE_NAME || "llm-proxy";

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

const t = initTRPC.create();

const appRouter = t.router({
  chatCompletion: t.procedure.input(chatCompletionInputSchema).mutation(async ({ input }) => {
    try {
      return await routerService.proxy(input);
    } catch (error) {
      if (error instanceof ProviderError) {
        throw new TRPCError({
          code: error.retryable ? "BAD_GATEWAY" : "INTERNAL_SERVER_ERROR",
          message: error.message,
          cause: error
        });
      }
      throw error;
    }
  })
});

const handler = createHTTPHandler({
  router: appRouter,
  createContext: () => ({})
});

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url && req.url.split("?")[0] === "/healthz") {
    const body = JSON.stringify({
      status: "ok",
      service: "llm-proxy",
      provider: resolvePrimaryProvider()
    });
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(body);
    return;
  }

  handler(req, res);
});

server.listen(port, () => {
  log("info", "LLM proxy listening", { port });
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { appRouter };
export type AppRouter = typeof appRouter;
