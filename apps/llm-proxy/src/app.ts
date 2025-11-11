import { initTRPC, TRPCError } from '@trpc/server';

import { Router, chatCompletionInputSchema } from './Router';
import { ProviderError } from './providers';

export type LlmProxyContext = {
  playerId?: string;
  requestId?: string;
};

export const createContext = (options?: LlmProxyContext): LlmProxyContext => ({
  playerId: options?.playerId,
  requestId: options?.requestId,
});

const routerService = new Router();
const t = initTRPC.context<LlmProxyContext>().create();

export const appRouter = t.router({
  chatCompletion: t.procedure.input(chatCompletionInputSchema).mutation(async ({ input, ctx }) => {
    try {
      return await routerService.proxy(input, { playerId: ctx.playerId, requestId: ctx.requestId });
    } catch (error) {
      if (error instanceof ProviderError) {
        const status = error.status ?? 500;
        let code: 'BAD_REQUEST' | 'BAD_GATEWAY' | 'INTERNAL_SERVER_ERROR' | 'FORBIDDEN' =
          'INTERNAL_SERVER_ERROR';
        if (status >= 500) {
          code = error.retryable ? 'BAD_GATEWAY' : 'INTERNAL_SERVER_ERROR';
        } else if (status === 400) {
          code = 'BAD_REQUEST';
        } else if (status === 401 || status === 403) {
          code = 'FORBIDDEN';
        } else {
          code = 'BAD_REQUEST';
        }
        throw new TRPCError({
          code,
          message: error.message,
          cause: error,
        });
      }
      throw error;
    }
  }),
});

export type AppRouter = typeof appRouter;
