"use strict";

import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { randomUUID } from "node:crypto";
import { log } from "@glass-frontier/utils";

import { appRouter, createContext } from "./app";
import { resolvePlayerIdFromHeaders } from "./auth";

const port = Number.parseInt(process.env.PORT || process.env.LLM_PROXY_PORT || "8082", 10);
process.env.SERVICE_NAME = process.env.SERVICE_NAME || "llm-proxy";

const server = createHTTPServer({
  router: appRouter,
  createContext: ({ req }) => {
    const headerValue = req.headers["x-request-id"];
    const requestId = Array.isArray(headerValue)
      ? headerValue[0]
      : typeof headerValue === "string"
      ? headerValue
      : randomUUID();

    return createContext({
      playerId: resolvePlayerIdFromHeaders(req.headers),
      requestId
    });
  }
}).listen(port);
console.log(`tRPC dev server on http://localhost:${port}`);

function shutdown() {
  log("info", "Shutting down LLM Proxy");
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
