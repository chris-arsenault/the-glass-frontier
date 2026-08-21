import { log } from '@glass-frontier/utils';
import { initTRPC } from '@trpc/server';

import type { Context } from './context';

const t = initTRPC.context<Context>().create();

/**
 * Read-only. The world vocabulary is versioned content in `@glass-frontier/dto`
 * and reaches the database through the seed step, so there is nothing to mutate
 * here — changing the world's shape means editing the artifact and redeploying.
 */
export const appRouter = t.router({
  getSchema: t.procedure.query(async ({ ctx }) => {
    log('info', 'world-schema-api: getSchema');
    return ctx.worldSchemaStore.getWorldSchema();
  }),
});

export type AppRouter = typeof appRouter;
