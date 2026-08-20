import {
  AUDIT_REVIEW_STATUSES,
  AUDIT_REVIEW_TAGS,
  AuditLogEntrySchema,
  AuditReviewRecordSchema,
  PlayerFeedbackRecordSchema,
  PromptTemplateIds,
  type AuditReviewStatus,
  type PromptTemplateId,
} from '@glass-frontier/dto';
import { hasAnyGroup } from '@glass-frontier/node-utils';
import { log } from '@glass-frontier/utils';
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context';
import { submitPlayerFeedbackInput } from './schemas/submitPlayerFeedback';

const t = initTRPC.context<Context>().create();
const moderatorProcedure = t.procedure.use(({ ctx, next }) => {
  if (!hasAnyGroup(ctx.identity, ['admin', 'moderator'])) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});

const requireCurrentPlayer = (ctx: Context, claimedPlayerId: string): string => {
  if (claimedPlayerId !== ctx.identity.sub) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return ctx.identity.sub;
};

async function withMutationTelemetry<T>(
  action: string,
  metadata: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    log('error', `Prompt mutation failed: ${action}`, {
      metadataKeys: Object.keys(metadata).join(','),
      reason: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  }
}
const auditStatusSchema = z.enum(AUDIT_REVIEW_STATUSES);
const auditTagSchema = z.enum(AUDIT_REVIEW_TAGS);
const templateIdSchema = z.enum(PromptTemplateIds);

const listAuditQueueInput = z.object({
  cursor: z.string().optional(),
  endDate: z.string().optional(),
  groupId: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
  playerId: z.string().optional(),
  scopeRef: z.string().optional(),
  scopeType: z.string().optional(),
  search: z.string().optional(),
  startDate: z.string().optional(),
  status: z.array(auditStatusSchema).optional(),
  templateId: templateIdSchema.optional(),
});

const saveAuditReviewInput = z.object({
  auditId: z.string().min(1),
  groupId: z.string().min(1),
  notes: z.string().max(4000).optional(),
  reviewerId: z.string().min(1),
  severity: z.enum(['critical', 'major', 'minor', 'info']).default('info'),
  status: z.enum(['in_progress', 'completed']),
  tags: z.array(auditTagSchema).default([]),
});

type QueueFilters = {
  endDate?: number;
  groupId?: string;
  playerId?: string;
  scopeRef?: string;
  scopeType?: string;
  search?: string;
  startDate?: number;
  statusFilter: Set<AuditReviewStatus> | null;
  templateId?: PromptTemplateId;
};

const parseDateFilter = (value?: string): number | undefined => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

const normalizeString = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const sanitizeQueueFilters = (input: z.infer<typeof listAuditQueueInput>): QueueFilters => {
  const playerId = normalizeString(input.playerId);
  const search = normalizeString(input.search);
  const groupId = normalizeString(input.groupId);
  const scopeType = normalizeString(input.scopeType);
  const scopeRef = normalizeString(input.scopeRef);
  const statusFilter =
    input.status !== undefined && input.status.length > 0 ? new Set(input.status) : null;
  return {
    endDate: parseDateFilter(input.endDate),
    groupId: groupId ?? undefined,
    playerId: playerId ?? undefined,
    scopeRef: scopeRef ?? undefined,
    scopeType: scopeType ?? undefined,
    search: search ?? undefined,
    startDate: parseDateFilter(input.startDate),
    statusFilter,
    templateId: input.templateId,
  };
};

export const promptRouter = t.router({
  getAuditEntry: moderatorProcedure
    .input(z.object({ auditId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const found = await ctx.opsStore.getAuditEntry(input.auditId);
      if (found === null) {
        throw new Error('Audit entry not found.');
      }
      return {
        entry: AuditLogEntrySchema.parse({
          ...found.entry,
          playerFeedback: found.feedback,
        }),
        review: found.review === null || found.review === undefined
          ? null
          : AuditReviewRecordSchema.parse(found.review),
      };
    }),

  getPromptTemplate: t.procedure
    .input(z.object({ playerId: z.string().min(1), templateId: templateIdSchema }))
    .query(async ({ ctx, input }) =>
      ctx.templateManager.getTemplate(requireCurrentPlayer(ctx, input.playerId), input.templateId)
    ),

  listAuditQueue: moderatorProcedure
    .input(listAuditQueueInput)
    .query(async ({ ctx, input }) => {
      const filters = sanitizeQueueFilters(input);
      const { cursor, items } = await ctx.opsStore.listAuditQueue({
        cursor: input.cursor,
        endDate: filters.endDate,
        groupId: filters.groupId,
        limit: input.limit,
        playerId: filters.playerId,
        scopeRef: filters.scopeRef,
        scopeType: filters.scopeType,
        search: filters.search,
        startDate: filters.startDate,
        templateId: filters.templateId,
      });
      const queueItems = ctx.opsStore.toQueueItems(items, filters.statusFilter);
      return {
        cursor: cursor ?? null,
        items: queueItems,
      };
    }),

  listPromptTemplates: t.procedure
    .input(z.object({ playerId: z.string().min(1) }))
    .query(async ({ ctx, input }) =>
      ctx.templateManager.listTemplates(requireCurrentPlayer(ctx, input.playerId))
    ),

  revertPromptTemplate: t.procedure
    .input(z.object({ playerId: z.string().min(1), templateId: templateIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const playerId = requireCurrentPlayer(ctx, input.playerId);
      return withMutationTelemetry('revert-template', { playerId, templateId: input.templateId }, () =>
        ctx.templateManager.revertTemplate({ playerId, templateId: input.templateId })
      );
    }),

  saveAuditReview: moderatorProcedure
    .input(saveAuditReviewInput)
    .mutation(async ({ ctx, input }) =>
      withMutationTelemetry('save-audit-review', { auditId: input.auditId, groupId: input.groupId }, async () => {
        const record = await ctx.opsStore.saveAuditReview({
          auditId: input.auditId,
          groupId: input.groupId,
          notes: normalizeString(input.notes),
          reviewerId: requireCurrentPlayer(ctx, input.reviewerId),
          severity: input.severity,
          status: input.status,
          tags: Array.from(new Set(input.tags ?? [])),
        });
        return AuditReviewRecordSchema.parse(record);
      })
    ),

  savePromptTemplate: t.procedure
    .input(
      z.object({
        editable: z.string().min(1),
        label: z.string().max(64).optional(),
        playerId: z.string().min(1),
        templateId: templateIdSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const playerId = requireCurrentPlayer(ctx, input.playerId);
      return withMutationTelemetry('save-template', { playerId, templateId: input.templateId }, () =>
        ctx.templateManager.saveTemplate({
          editable: input.editable,
          label: input.label,
          playerId,
          templateId: input.templateId,
        })
      );
    }),

  submitPlayerFeedback: t.procedure
    .input(submitPlayerFeedbackInput)
    .mutation(async ({ ctx, input }) =>
      withMutationTelemetry(
        'submit-player-feedback',
        { auditId: input.auditId, chronicleId: input.chronicleId, turnId: input.turnId },
        async () => {
          const playerId = requireCurrentPlayer(ctx, input.playerId);
          // Get or create audit group for this turn
          const auditGroup = await ctx.opsStore.auditGroupStore.ensureGroup({
            chronicleId: input.chronicleId,
            playerId,
            scopeRef: input.turnId,
            scopeType: 'turn',
          });
          const record = await ctx.auditFeedbackStore.create({
            auditId: input.auditId,
            chronicleId: input.chronicleId,
            comment: normalizeString(input.comment),
            expectedIntentType: input.expectedIntentType ?? null,
            expectedInventoryDelta: input.expectedInventoryDelta ?? null,
            expectedInventoryNotes: normalizeString(input.expectedInventoryNotes),
            expectedLocationChange: input.expectedLocationChange ?? null,
            expectedLocationNotes: normalizeString(input.expectedLocationNotes),
            expectedSkillCheck: input.expectedSkillCheck ?? null,
            expectedSkillNotes: normalizeString(input.expectedSkillNotes),
            gmEntryId: input.gmEntryId,
            groupId: auditGroup.id,
            metadata: {},
            note: normalizeString(input.comment),
            playerId,
            sentiment: input.sentiment,
            turnId: input.turnId,
            turnSequence: input.turnSequence,
          });
          return PlayerFeedbackRecordSchema.parse(record);
        }
      )
    ),
});

export type PromptRouter = typeof promptRouter;
