import { z } from 'zod';

import { PromptTemplateIds, type PromptTemplateId } from '../templates/PromptTemplates';

export const AUDIT_REVIEW_TAGS = [
  'coverage_gap',
  'hallucination',
  'tone_mismatch',
  'style_error',
  'instruction_ignored',
  'context_misuse',
  'verbosity_issue',
  'output_safety_concern',
  'format_violation',
] as const;

export const AUDIT_REVIEW_SEVERITIES = ['info', 'minor', 'major', 'critical'] as const;

export const AUDIT_REVIEW_STATUSES = ['unreviewed', 'in_progress', 'completed'] as const;

export type AuditReviewTag = (typeof AUDIT_REVIEW_TAGS)[number];
export type AuditReviewSeverity = (typeof AUDIT_REVIEW_SEVERITIES)[number];
export type AuditReviewStatus = (typeof AUDIT_REVIEW_STATUSES)[number];

const TEMPLATE_ID_ENUM = [...PromptTemplateIds] as [PromptTemplateId, ...PromptTemplateId[]];
const REVIEW_TAG_ENUM = [...AUDIT_REVIEW_TAGS] as [AuditReviewTag, ...AuditReviewTag[]];
const REVIEW_SEVERITY_ENUM = [...AUDIT_REVIEW_SEVERITIES] as [
  AuditReviewSeverity,
  ...AuditReviewSeverity[],
];
const REVIEW_STATUS_ENUM = [...AUDIT_REVIEW_STATUSES] as [
  AuditReviewStatus,
  ...AuditReviewStatus[],
];

export const AuditReviewRecordSchema = z.object({
  auditId: z.string().min(1),
  storageKey: z.string().min(1),
  nodeId: z.string().optional().nullable(),
  templateId: z.enum(TEMPLATE_ID_ENUM).optional().nullable(),
  reviewerLoginId: z.string().min(1),
  reviewerName: z.string().optional().nullable(),
  status: z.enum(REVIEW_STATUS_ENUM),
  notes: z.string().optional().nullable(),
  tags: z.array(z.enum(REVIEW_TAG_ENUM)).default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  completedAt: z.string().optional().nullable(),
  draftAt: z.string().optional().nullable(),
});

export type AuditReviewRecord = z.infer<typeof AuditReviewRecordSchema>;

export const AuditLogEntrySchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  createdAtMs: z.number().int().nonnegative(),
  nodeId: z.string().optional().nullable(),
  playerId: z.string().optional().nullable(),
  providerId: z.string().min(1),
  metadata: z.record(z.string(), z.any()).optional().nullable(),
  request: z.record(z.string(), z.any()),
  response: z.any(),
  requestContextId: z.string().optional().nullable(),
  storageKey: z.string().min(1),
});

export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const AuditQueueItemSchema = z.object({
  auditId: z.string().min(1),
  storageKey: z.string().min(1),
  createdAt: z.string().min(1),
  createdAtMs: z.number().int().nonnegative(),
  nodeId: z.string().optional().nullable(),
  templateId: z.enum(TEMPLATE_ID_ENUM).optional().nullable(),
  playerId: z.string().optional().nullable(),
  requestContextId: z.string().optional().nullable(),
  providerId: z.string().optional().nullable(),
  reviewerLoginId: z.string().optional().nullable(),
  reviewerName: z.string().optional().nullable(),
  status: z.enum(REVIEW_STATUS_ENUM),
  notes: z.string().optional().nullable(),
  tags: z.array(z.enum(REVIEW_TAG_ENUM)),
});

export type AuditQueueItem = z.infer<typeof AuditQueueItemSchema>;

export const AuditProposalRecordSchema = z.object({
  id: z.string().min(1),
  templateId: z.enum(TEMPLATE_ID_ENUM),
  summary: z.string().min(1),
  rationale: z.string().min(1),
  suggestedChange: z.string().optional().nullable(),
  tags: z.array(z.enum(REVIEW_TAG_ENUM)).default([]),
  severity: z.enum(REVIEW_SEVERITY_ENUM),
  confidence: z.number().min(0).max(1),
  createdAt: z.string().min(1),
  linkedReviewIds: z.array(z.string().min(1)).default([]),
  reviewCount: z.number().int().nonnegative(),
});

export type AuditProposalRecord = z.infer<typeof AuditProposalRecordSchema>;
