"use strict";

import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { initTRPC, TRPCError } from "@trpc/server";
import { log } from "@glass-frontier/utils";
import { Router, chatCompletionInputSchema } from "./Router";
import { ProviderError } from "./providers";

const port = Number.parseInt(process.env.PORT || process.env.LLM_PROXY_PORT || "8082", 10);
const routerService = new Router();
process.env.SERVICE_NAME = process.env.SERVICE_NAME || "llm-proxy";

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

const server = createHTTPServer({
  router: appRouter,
  createContext: () => ({})
}).listen(port);
console.log(`tRPC dev server on http://localhost:${port}`);

function shutdown() {
  log("info", "Shutting down LLM Proxy");
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { appRouter };
export type AppRouter = typeof appRouter;
