/* eslint-disable @typescript-eslint/strict-boolean-expressions, complexity, no-await-in-loop */
import {
  AUDIT_REVIEW_STATUSES,
  AUDIT_REVIEW_TAGS,
  AuditLogEntrySchema,
  AuditReviewRecordSchema,
  PlayerFeedbackRecordSchema,
  PromptTemplateIds,
  type AuditLogEntry,
  type AuditQueueItem,
  type AuditReviewRecord,
  type AuditReviewStatus,
  type PromptTemplateId,
} from '@glass-frontier/dto';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context';
import { submitPlayerFeedbackInput } from './schemas/submitPlayerFeedback';

const t = initTRPC.context<Context>().create();
const auditStatusSchema = z.enum(AUDIT_REVIEW_STATUSES);
const auditTagSchema = z.enum(AUDIT_REVIEW_TAGS);
const templateIdSchema = z.enum(PromptTemplateIds as [PromptTemplateId, ...PromptTemplateId[]]);

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
  };
};

const toQueueItem = (
  entry: AuditLogEntry,
  review: AuditReviewRecord | null
): AuditQueueItem => ({
  auditId: entry.id,
  createdAt: entry.createdAt,
  createdAtMs: entry.createdAtMs,
  nodeId: entry.nodeId ?? null,
  notes: review?.notes ?? null,
  playerFeedback: entry.playerFeedback ?? [],
  playerId: entry.playerId ?? null,
  providerId: entry.providerId ?? null,
  requestContextId: entry.requestContextId ?? null,
  reviewerId: review?.reviewerId ?? null,
  reviewerName: review?.reviewerName ?? null,
  status: review?.status ?? 'unreviewed',
  storageKey: entry.storageKey,
  tags: review?.tags ?? [],
  templateId: review?.templateId ?? null,
});

const buildReviewMap = (reviews: AuditReviewRecord[]): Map<string, AuditReviewRecord> => {
  const map = new Map<string, AuditReviewRecord>();
  for (const review of reviews) {
    if (!map.has(review.auditId)) {
      map.set(review.auditId, review);
    }
  }
  return map;
};

const buildFeedbackMap = (
  feedback: Array<{ auditId: string | null; record: ReturnType<typeof PlayerFeedbackRecordSchema.parse> }>
): Map<string, Array<ReturnType<typeof PlayerFeedbackRecordSchema.parse>>> => {
  const map = new Map<string, Array<ReturnType<typeof PlayerFeedbackRecordSchema.parse>>>();
  for (const item of feedback) {
    if (item.auditId === null) {
      continue;
    }
    const bucket = map.get(item.auditId) ?? [];
    bucket.push(item.record);
    map.set(item.auditId, bucket);
  }
  return map;
};

export const promptRouter = t.router({
  getAuditEntry: t.procedure
    .input(z.object({ auditId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const found = await ctx.auditLogStore.get(input.auditId);
      if (found === null) {
        throw new Error('Audit entry not found.');
      }
      const reviews = await ctx.auditReviewStore.listByGroup(found.groupId);
      const review = reviews.find((entry) => entry.auditId === input.auditId) ?? null;
      const feedback = await ctx.auditFeedbackStore.listByGroup(found.groupId);
      const feedbackForAudit = feedback.filter((entry) => entry.auditId === input.auditId);
      return {
        entry: AuditLogEntrySchema.parse({
          ...found.entry,
          playerFeedback: feedbackForAudit,
        }),
        review: review ? AuditReviewRecordSchema.parse(review) : null,
      };
    }),

  listAuditQueue: t.procedure
    .input(listAuditQueueInput)
    .query(async ({ ctx, input }) => {
      const filters = sanitizeQueueFilters(input);
      const { entries, nextCursor } = await ctx.auditLogStore.listRecent({
        cursor: input.cursor,
        endDate: filters.endDate,
        groupId: filters.groupId,
        limit: input.limit,
        playerId: filters.playerId,
        scopeRef: filters.scopeRef,
        scopeType: filters.scopeType,
        search: filters.search,
        startDate: filters.startDate,
      });

      const groupIds = Array.from(new Set(entries.map((e) => e.groupId)));
      const reviewsByGroup = new Map<string, Map<string, AuditReviewRecord>>();
      const feedbackByGroup = new Map<string, Map<string, Array<ReturnType<typeof PlayerFeedbackRecordSchema.parse>>>>();
      for (const groupId of groupIds) {
        const reviews = await ctx.auditReviewStore.listByGroup(groupId);
        reviewsByGroup.set(groupId, buildReviewMap(reviews));
        const feedback = await ctx.auditFeedbackStore.listByGroup(groupId);
        const fbMap = buildFeedbackMap(feedback.map((record) => ({ auditId: record.auditId, record })));
        feedbackByGroup.set(groupId, fbMap);
      }

      const queueItems: AuditQueueItem[] = [];
      for (const { entry, groupId } of entries) {
        const review = reviewsByGroup.get(groupId)?.get(entry.id) ?? null;
        const playerFeedback = feedbackByGroup.get(groupId)?.get(entry.id) ?? [];
        const item = toQueueItem({ ...entry, playerFeedback }, review);
        if (filters.statusFilter && !filters.statusFilter.has(item.status)) {
          continue;
        }
        queueItems.push(item);
      }

      return {
        cursor: nextCursor ?? null,
        items: queueItems,
      };
    }),

  listPromptTemplates: t.procedure
    .input(z.object({ playerId: z.string().min(1) }))
    .query(async ({ ctx, input }) => ctx.templateManager.listTemplates(input.playerId)),

  revertPromptTemplate: t.procedure
    .input(z.object({ playerId: z.string().min(1), templateId: templateIdSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.templateManager.revertTemplate({ playerId: input.playerId, templateId: input.templateId })
    ),

  saveAuditReview: t.procedure
    .input(saveAuditReviewInput)
    .mutation(async ({ ctx, input }) => {
      const record = await ctx.auditReviewStore.save({
        auditId: input.auditId,
        groupId: input.groupId,
        notes: normalizeString(input.notes),
        reviewerId: input.reviewerId,
        severity: input.severity,
        status: input.status,
        tags: Array.from(new Set(input.tags ?? [])),
      });
      return AuditReviewRecordSchema.parse(record);
    }),

  savePromptTemplate: t.procedure
    .input(
      z.object({
        editable: z.string().min(1),
        label: z.string().max(64).optional(),
        playerId: z.string().min(1),
        templateId: templateIdSchema,
      })
    )
    .mutation(async ({ ctx, input }) =>
      ctx.templateManager.saveTemplate({
        editable: input.editable,
        label: input.label,
        playerId: input.playerId,
        templateId: input.templateId,
      })
    ),

  submitPlayerFeedback: t.procedure
    .input(submitPlayerFeedbackInput)
    .mutation(async ({ ctx, input }) => {
      const playerId = normalizeString(input.playerId);
      if (playerId === null) {
        throw new Error('Player identifier required for feedback submission.');
      }
      const audit = await ctx.auditLogStore.get(input.auditId);
      if (audit === null) {
        throw new Error('Audit entry not found for feedback.');
      }
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
        groupId: audit.groupId,
        metadata: {},
        note: normalizeString(input.comment),
        playerId,
        sentiment: input.sentiment,
        turnId: input.turnId,
        turnSequence: input.turnSequence,
      });
      return PlayerFeedbackRecordSchema.parse(record);
    }),
});

export type PromptRouter = typeof promptRouter;
