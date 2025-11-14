import {
  AUDIT_REVIEW_STATUSES,
  AUDIT_REVIEW_TAGS,
  PLAYER_FEEDBACK_SENTIMENTS,
  AuditLogEntrySchema,
  AuditProposalRecordSchema,
  AuditReviewRecordSchema,
  PlayerFeedbackRecordSchema,
  PromptTemplateIds,
  type AuditLogEntry,
  type AuditProposalRecord,
  type AuditQueueItem,
  type AuditReviewRecord,
  type AuditReviewSeverity,
  type AuditReviewStatus,
  type AuditReviewTag,
  type PromptTemplateId,
} from '@glass-frontier/dto';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context';

const t = initTRPC.context<Context>().create();
const templateIdSchema = z.enum(PromptTemplateIds as [PromptTemplateId, ...PromptTemplateId[]]);
const auditStatusSchema = z.enum(AUDIT_REVIEW_STATUSES);
const auditTagSchema = z.enum(AUDIT_REVIEW_TAGS);
const feedbackSentimentSchema = z.enum(PLAYER_FEEDBACK_SENTIMENTS);

const listAuditQueueInput = z.object({
  cursor: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
  nodeId: z.string().optional(),
  playerId: z.string().optional(),
  search: z.string().optional(),
  startDate: z.string().optional(),
  status: z.array(auditStatusSchema).optional(),
  templateId: templateIdSchema.optional(),
});

const saveAuditReviewInput = z.object({
  auditId: z.string().min(1),
  loginId: z.string().min(1),
  nodeId: z.string().optional(),
  notes: z.string().max(4000).optional(),
  reviewerName: z.string().max(120).optional(),
  status: z.enum(['in_progress', 'completed']),
  storageKey: z.string().min(1),
  tags: z.array(auditTagSchema).default([]),
  templateId: templateIdSchema.optional(),
});

const submitPlayerFeedbackInput = z.object({
  auditId: z.string().min(1),
  chronicleId: z.string().min(1),
  comment: z.string().max(2000).optional(),
  gmEntryId: z.string().min(1),
  playerId: z.string().optional(),
  playerLoginId: z.string().min(1),
  sentiment: feedbackSentimentSchema,
  turnId: z.string().min(1),
  turnSequence: z.number().int().nonnegative(),
});

const getSeverityWeight = (severity: AuditReviewSeverity): number => {
  switch (severity) {
  case 'critical':
    return 3;
  case 'major':
    return 2;
  case 'minor':
    return 1;
  default:
    return 0;
  }
};

const MIN_REVIEWS_FOR_PROPOSAL = 2;

const normalizeString = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const resolveTemplateId = (nodeId?: string | null): PromptTemplateId | null => {
  if (typeof nodeId !== 'string') {
    return null;
  }
  return (PromptTemplateIds as string[]).includes(nodeId) ? (nodeId as PromptTemplateId) : null;
};

const groupByTemplate = (
  reviews: AuditReviewRecord[],
  templateFilter?: PromptTemplateId
): Map<PromptTemplateId, AuditReviewRecord[]> => {
  const map = new Map<PromptTemplateId, AuditReviewRecord[]>();
  for (const review of reviews) {
    const templateId = review.templateId ?? resolveTemplateId(review.nodeId);
    if (templateId === null) {
      continue;
    }
    if (templateFilter !== undefined && templateId !== templateFilter) {
      continue;
    }
    const bucket = map.get(templateId) ?? [];
    bucket.push(review);
    map.set(templateId, bucket);
  }
  return map;
};

const summarizeTags = (reviews: AuditReviewRecord[]): string[] => {
  const counts = new Map<string, number>();
  for (const review of reviews) {
    for (const tag of review.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);
};

const deriveSeverityFromTags = (tags?: AuditReviewTag[] | null): AuditReviewSeverity => {
  const list = Array.isArray(tags) ? tags : [];
  if (list.includes('output_safety_concern')) {
    return 'critical';
  }
  if (list.some((tag) => tag === 'hallucination' || tag === 'instruction_ignored')) {
    return 'major';
  }
  if (
    list.some((tag) =>
      ['coverage_gap', 'tone_mismatch', 'style_error', 'context_misuse', 'verbosity_issue', 'format_violation'].includes(tag)
    )
  ) {
    return 'minor';
  }
  return 'info';
};

const selectAggregateSeverity = (reviews: AuditReviewRecord[]): AuditReviewSeverity => {
  let current: AuditReviewSeverity = 'info';
  for (const review of reviews) {
    const derived = deriveSeverityFromTags(review.tags);
    if (getSeverityWeight(derived) > getSeverityWeight(current)) {
      current = derived;
    }
  }
  return current;
};

const computeConfidence = (reviews: AuditReviewRecord[]): number => {
  if (reviews.length === 0) {
    return 0;
  }
  let totalWeight = 0;
  for (const review of reviews) {
    totalWeight += getSeverityWeight(deriveSeverityFromTags(review.tags));
  }
  const avgSeverity = totalWeight / reviews.length;
  return Math.min(1, 0.3 + reviews.length * 0.1 + avgSeverity * 0.15);
};

const normalizeNote = (value?: string | null): string | null => normalizeString(value);

const composeProposal = (
  templateId: PromptTemplateId,
  reviews: AuditReviewRecord[]
): AuditProposalRecord => {
  const tags = summarizeTags(reviews);
  const severity = selectAggregateSeverity(reviews);
  const confidence = computeConfidence(reviews);
  const createdAt = new Date().toISOString();
  const linkedReviewIds = reviews.map((review) => review.auditId);
  const reviewSummaries = reviews
    .slice(0, 3)
    .map((review) => normalizeNote(review.notes) ?? 'No notes provided.')
    .map((entry) => `• ${entry}`)
    .join('\n');
  const changeSegments = reviews
    .map((review) => normalizeNote(review.notes))
    .filter((entry): entry is string => entry !== null)
    .slice(0, 2)
    .join('\n---\n');
  const suggestedChange =
    changeSegments.length > 0
      ? changeSegments
      : 'Incorporate moderator findings to tighten coverage expectations and clarify safety directives.';

  const summary = `${reviews.length} completed reviews highlight ${tags[0] ?? 'recurring issues'} in ${templateId}.`;
  const rationale = `${reviewSummaries}\nConfidence: ${(confidence * 100).toFixed(0)}%`;

  const proposal = {
    confidence,
    createdAt,
    id: `proposal-${templateId}-${Date.now()}`,
    linkedReviewIds,
    rationale,
    reviewCount: reviews.length,
    severity,
    suggestedChange,
    summary,
    tags,
    templateId,
  };

  const parsed = AuditProposalRecordSchema.safeParse(proposal);
  if (!parsed.success) {
    throw new Error('Failed to compose audit proposal payload.');
  }
  return parsed.data;
};

const plansDiffer = (
  latest: AuditProposalRecord | undefined,
  reviews: AuditReviewRecord[]
): boolean => {
  if (latest === undefined) {
    return true;
  }
  const priorIds = new Set(latest.linkedReviewIds ?? []);
  return reviews.some((review) => !priorIds.has(review.auditId));
};

type QueueFilters = {
  endDate?: number;
  nodeId?: string;
  playerId?: string;
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

const sanitizeQueueFilters = (input: z.infer<typeof listAuditQueueInput>): QueueFilters => {
  const nodeId = normalizeString(input.nodeId);
  const playerId = normalizeString(input.playerId);
  const search = normalizeString(input.search);
  const statusFilter =
    input.status !== undefined && input.status.length > 0 ? new Set(input.status) : null;
  return {
    endDate: parseDateFilter(input.endDate),
    nodeId: nodeId ?? undefined,
    playerId: playerId ?? undefined,
    search: search ?? undefined,
    startDate: parseDateFilter(input.startDate),
    statusFilter,
    templateId: input.templateId ?? undefined,
  };
};

/* eslint-disable complexity */
const toQueueItem = (
  entry: AuditLogEntry,
  review: AuditReviewRecord | null
): AuditQueueItem => {
  const templateId = review?.templateId ?? resolveTemplateId(entry.nodeId);
  return {
    auditId: entry.id,
    createdAt: entry.createdAt,
    createdAtMs: entry.createdAtMs,
    nodeId: entry.nodeId ?? null,
    notes: review?.notes ?? null,
    playerFeedback: entry.playerFeedback ?? [],
    playerId: entry.playerId ?? null,
    providerId: entry.providerId ?? null,
    requestContextId: entry.requestContextId ?? null,
    reviewerLoginId: review?.reviewerLoginId ?? null,
    reviewerName: review?.reviewerName ?? null,
    status: review?.status ?? 'unreviewed',
    storageKey: entry.storageKey,
    tags: review?.tags ?? [],
    templateId: templateId ?? null,
  };
};
/* eslint-enable complexity */

const buildQueueItems = (
  entries: AuditLogEntry[],
  reviews: Array<AuditReviewRecord | null>,
  statusFilter: Set<AuditReviewStatus> | null
): AuditQueueItem[] => {
  const queue: AuditQueueItem[] = [];
  const reviewIterator = reviews[Symbol.iterator]();
  for (const entry of entries) {
    const nextReview = reviewIterator.next();
    const review = nextReview.done === true ? null : nextReview.value ?? null;
    const queueItem = toQueueItem(entry, review);
    if (statusFilter !== null) {
      if (!statusFilter.has(queueItem.status)) {
        continue;
      }
    }
    queue.push(queueItem);
  }
  return queue;
};

export const promptRouter = t.router({
  generateAuditProposals: t.procedure
    .input(z.object({ templateId: templateIdSchema.optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const completedReviews = (await ctx.auditModerationStore.listReviews()).filter(
        (review) => review.status === 'completed'
      );
      const existingProposals = await ctx.auditModerationStore.listProposals();
      const grouped = groupByTemplate(completedReviews, input?.templateId);
      const pending: AuditProposalRecord[] = [];

      for (const [templateId, reviewGroup] of grouped) {
        if (reviewGroup.length < MIN_REVIEWS_FOR_PROPOSAL) {
          continue;
        }
        const latestProposal = existingProposals
          .filter((proposal) => proposal.templateId === templateId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .at(0);
        if (!plansDiffer(latestProposal, reviewGroup)) {
          continue;
        }
        pending.push(composeProposal(templateId, reviewGroup));
      }

      if (pending.length === 0) {
        return [];
      }

      await Promise.all(
        pending.map((proposal) => ctx.auditModerationStore.saveProposal(proposal))
      );
      return pending;
    }),

  getAuditEntry: t.procedure
    .input(
      z.object({
        storageKey: z.string().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const entry = await ctx.auditLogStore.getEntry(input.storageKey);
      if (entry === null) {
        throw new Error('Audit entry not found.');
      }
      const playerFeedback = await ctx.auditFeedbackStore.listFeedbackForAudit(entry.id);
      const review = await ctx.auditModerationStore.getReview(entry.id);
      return {
        entry: AuditLogEntrySchema.parse({
          ...entry,
          playerFeedback,
        }),
        review: review !== null ? AuditReviewRecordSchema.parse(review) : null,
      };
    }),

  getAuditProposal: t.procedure
    .input(z.object({ proposalId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const proposal = await ctx.auditModerationStore.getProposal(input.proposalId);
      if (proposal === null) {
        throw new Error('Proposal not found.');
      }
      return AuditProposalRecordSchema.parse(proposal);
    }),

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

  listAuditProposals: t.procedure.query(async ({ ctx }) => {
    const proposals = await ctx.auditModerationStore.listProposals();
    return proposals.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }),

  listAuditQueue: t.procedure
    .input(listAuditQueueInput)
    .query(async ({ ctx, input }) => {
      const limit = Math.min(input.limit ?? 25, 100);
      const filters = sanitizeQueueFilters(input);
      const { entries, nextCursor } = await ctx.auditLogStore.listRecentEntries({
        cursor: input.cursor,
        endDate: filters.endDate,
        limit,
        nodeId: filters.nodeId,
        playerId: filters.playerId,
        search: filters.search,
        startDate: filters.startDate,
        templateId: filters.templateId,
      });

      const feedbackLookup = await ctx.auditFeedbackStore.listFeedbackForAudits(
        entries.map((entry) => entry.id)
      );
      const reviews = await Promise.all(
        entries.map((entry) => ctx.auditModerationStore.getReview(entry.id))
      );
      const enrichedEntries = entries.map((entry) => ({
        ...entry,
        playerFeedback: feedbackLookup.get(entry.id) ?? [],
      }));

      return {
        cursor: nextCursor ?? null,
        items: buildQueueItems(enrichedEntries, reviews, filters.statusFilter),
      };
    }),

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

  saveAuditReview: t.procedure
    .input(saveAuditReviewInput)
    .mutation(async ({ ctx, input }) => {
      const templateId = input.templateId ?? resolveTemplateId(input.nodeId);
      const record = await ctx.auditModerationStore.saveReview({
        auditId: input.auditId,
        nodeId: input.nodeId ?? null,
        notes: normalizeString(input.notes),
        reviewerLoginId: input.loginId,
        reviewerName: normalizeString(input.reviewerName),
        status: input.status,
        storageKey: input.storageKey,
        tags: Array.from(new Set(input.tags ?? [])),
        templateId: templateId ?? null,
      });
      return AuditReviewRecordSchema.parse(record);
    }),

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

  submitPlayerFeedback: t.procedure
    .input(submitPlayerFeedbackInput)
    .mutation(async ({ ctx, input }) => {
      const record = await ctx.auditFeedbackStore.saveFeedback({
        auditId: input.auditId,
        chronicleId: input.chronicleId,
        comment: normalizeString(input.comment),
        gmEntryId: input.gmEntryId,
        playerId: normalizeString(input.playerId),
        playerLoginId: input.playerLoginId,
        sentiment: input.sentiment,
        turnId: input.turnId,
        turnSequence: input.turnSequence,
      });
      return PlayerFeedbackRecordSchema.parse(record);
    }),
});

export type PromptRouter = typeof promptRouter;
