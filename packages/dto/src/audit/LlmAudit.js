import { z } from 'zod';
import { IntentType as IntentTypeSchema } from '../narrative/IntentType';
import { PromptTemplateIds } from '../templates/PromptTemplates';
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
];
export const AUDIT_REVIEW_SEVERITIES = ['info', 'minor', 'major', 'critical'];
export const AUDIT_REVIEW_STATUSES = ['unreviewed', 'in_progress', 'completed'];
export const PLAYER_FEEDBACK_SENTIMENTS = ['positive', 'neutral', 'negative'];
const FEEDBACK_SENTIMENT_ENUM = [...PLAYER_FEEDBACK_SENTIMENTS];
export const PlayerFeedbackRecordSchema = z.object({
    auditId: z.string().min(1).optional().nullable(),
    chronicleId: z.string().min(1),
    comment: z.string().max(2000).optional().nullable(),
    createdAt: z.string().min(1),
    expectedIntentType: IntentTypeSchema.optional().nullable(),
    expectedInventoryDelta: z.boolean().optional().nullable(),
    expectedInventoryNotes: z.string().max(2000).optional().nullable(),
    expectedLocationChange: z.boolean().optional().nullable(),
    expectedLocationNotes: z.string().max(2000).optional().nullable(),
    expectedSkillCheck: z.boolean().optional().nullable(),
    expectedSkillNotes: z.string().max(2000).optional().nullable(),
    gmEntryId: z.string().min(1),
    groupId: z.string().min(1),
    id: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
    playerId: z.string().min(1),
    sentiment: z.enum(FEEDBACK_SENTIMENT_ENUM),
    turnId: z.string().min(1),
    turnSequence: z.number().int().nonnegative(),
    updatedAt: z.string().min(1),
});
export const LlmTraceSchema = z.object({
    auditId: z.string().min(1),
    nodeId: z.string().min(1),
    requestId: z.string().min(1),
});
const TEMPLATE_ID_ENUM = [...PromptTemplateIds];
const REVIEW_TAG_ENUM = [...AUDIT_REVIEW_TAGS];
const REVIEW_SEVERITY_ENUM = [...AUDIT_REVIEW_SEVERITIES];
const REVIEW_STATUS_ENUM = [...AUDIT_REVIEW_STATUSES];
export const AuditReviewRecordSchema = z.object({
    auditId: z.string().min(1),
    completedAt: z.string().optional().nullable(),
    createdAt: z.string().min(1),
    draftAt: z.string().optional().nullable(),
    id: z.string().min(1),
    nodeId: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    reviewerId: z.string().min(1),
    reviewerName: z.string().optional().nullable(),
    status: z.enum(REVIEW_STATUS_ENUM),
    storageKey: z.string().min(1),
    tags: z.array(z.enum(REVIEW_TAG_ENUM)).default([]),
    templateId: z.enum(TEMPLATE_ID_ENUM).optional().nullable(),
    updatedAt: z.string().min(1),
});
export const AuditLogEntrySchema = z.object({
    createdAt: z.string().min(1),
    createdAtMs: z.number().int().nonnegative(),
    id: z.string().min(1),
    metadata: z.record(z.string(), z.any()).optional().nullable(),
    nodeId: z.string().optional().nullable(),
    playerFeedback: z.array(PlayerFeedbackRecordSchema).optional(),
    playerId: z.string().optional().nullable(),
    providerId: z.string().min(1),
    request: z.record(z.string(), z.any()),
    requestContextId: z.string().optional().nullable(),
    response: z.any(),
    storageKey: z.string().min(1),
});
export const AuditQueueItemSchema = z.object({
    auditId: z.string().min(1),
    chronicleId: z.string().optional().nullable(),
    createdAt: z.string().min(1),
    createdAtMs: z.number().int().nonnegative(),
    groupId: z.string().min(1),
    nodeId: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    playerFeedback: z.array(PlayerFeedbackRecordSchema).optional(),
    playerId: z.string().optional().nullable(),
    providerId: z.string().optional().nullable(),
    requestContextId: z.string().optional().nullable(),
    reviewerId: z.string().optional().nullable(),
    reviewerName: z.string().optional().nullable(),
    status: z.enum(REVIEW_STATUS_ENUM),
    storageKey: z.string().min(1),
    tags: z.array(z.enum(REVIEW_TAG_ENUM)),
    templateId: z.enum(TEMPLATE_ID_ENUM).optional().nullable(),
    turnId: z.string().optional().nullable(),
    turnSequence: z.number().int().nonnegative().optional().nullable(),
});
export const AuditProposalRecordSchema = z.object({
    confidence: z.number().min(0).max(1),
    createdAt: z.string().min(1),
    id: z.string().min(1),
    linkedReviewIds: z.array(z.string().min(1)).default([]),
    rationale: z.string().min(1),
    reviewCount: z.number().int().nonnegative(),
    severity: z.enum(REVIEW_SEVERITY_ENUM),
    suggestedChange: z.string().optional().nullable(),
    summary: z.string().min(1),
    tags: z.array(z.enum(REVIEW_TAG_ENUM)).default([]),
    templateId: z.enum(TEMPLATE_ID_ENUM),
});
