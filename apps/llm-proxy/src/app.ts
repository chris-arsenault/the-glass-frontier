import { initTRPC, TRPCError } from "@trpc/server";

import { Router, chatCompletionInputSchema } from "./Router";
import { ProviderError } from "./providers";

const routerService = new Router();
const t = initTRPC.create();

export const appRouter = t.router({
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

export type AppRouter = typeof appRouter;

export const createContext = () => ({});
