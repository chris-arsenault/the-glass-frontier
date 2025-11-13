import { PromptTemplateIds, type PromptTemplateId } from '@glass-frontier/dto';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context';

const t = initTRPC.context<Context>().create();
const templateIdSchema = z.enum(PromptTemplateIds as [PromptTemplateId, ...PromptTemplateId[]]);

export const promptRouter = t.router({
  getPromptTemplate: t.procedure
    .input(
      z.object({
        loginId: z.string().min(1),
        templateId: templateIdSchema,
      })
    )
    .query(async ({ ctx, input }) =>
      ctx.templateManager.getTemplate(input.loginId, input.templateId)
    ),

  listPromptTemplates: t.procedure
    .input(z.object({ loginId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.templateManager.listTemplates(input.loginId)),

  revertPromptTemplate: t.procedure
    .input(
      z.object({
        loginId: z.string().min(1),
        templateId: templateIdSchema,
      })
    )
    .mutation(async ({ ctx, input }) =>
      ctx.templateManager.revertTemplate({ loginId: input.loginId, templateId: input.templateId })
    ),

  savePromptTemplate: t.procedure
    .input(
      z.object({
        editable: z.string().min(1),
        label: z.string().max(64).optional(),
        loginId: z.string().min(1),
        templateId: templateIdSchema,
      })
    )
    .mutation(async ({ ctx, input }) =>
      ctx.templateManager.saveTemplate({
        editable: input.editable,
        label: input.label,
        loginId: input.loginId,
        templateId: input.templateId,
      })
    ),
});

export type PromptRouter = typeof promptRouter;
