import { initTRPC } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context';

const t = initTRPC.context<Context>().create();

export const locationRouter = t.router({
  deprecated: t.procedure
    .input(z.void().optional())
    .query(() => {
      throw new Error('Location API has been removed. Use the atlas and world schema APIs instead.');
    }),
});

export type LocationRouter = typeof locationRouter;
