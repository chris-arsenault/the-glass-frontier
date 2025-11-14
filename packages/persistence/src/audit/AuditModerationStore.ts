import type {
  AuditProposalRecord,
  AuditReviewRecord,
  AuditReviewStatus,
  AuditReviewTag,
  PromptTemplateId,
} from '@glass-frontier/dto';
import { AuditProposalRecordSchema, AuditReviewRecordSchema } from '@glass-frontier/dto';

import { HybridObjectStore } from '../hybridObjectStore';

const DEFAULT_PREFIX = '_llm-audit';
const REVIEW_FOLDER = 'reviews';
const PROPOSAL_FOLDER = 'proposals';

export type SaveReviewPayload = {
  auditId: string;
  storageKey: string;
  reviewerLoginId: string;
  reviewerName?: string | null;
  status: AuditReviewStatus;
  nodeId?: string | null;
  templateId?: PromptTemplateId | null;
  notes?: string | null;
  tags?: AuditReviewTag[];
};

export class AuditModerationStore extends HybridObjectStore {
  constructor(options: { bucket: string; prefix?: string | null; region?: string }) {
    super({
      bucket: options.bucket,
      prefix: options.prefix ?? DEFAULT_PREFIX,
      region: options.region,
    });
  }

  async getReview(auditId: string): Promise<AuditReviewRecord | null> {
    const raw = await this.getJson<AuditReviewRecord>(this.#reviewKey(auditId));
    if (raw === null) {
      return null;
    }
    const parsed = AuditReviewRecordSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  /* eslint-disable complexity */
  async saveReview(payload: SaveReviewPayload): Promise<AuditReviewRecord> {
    const now = new Date().toISOString();
    const existing = await this.getReview(payload.auditId);
    const nextRecord: AuditReviewRecord = {
      auditId: payload.auditId,
      completedAt:
        payload.status === 'completed'
          ? now
          : payload.status === 'in_progress'
            ? existing?.completedAt ?? null
            : null,
      createdAt: existing?.createdAt ?? now,
      draftAt: payload.status === 'in_progress' ? now : existing?.draftAt ?? null,
      nodeId: payload.nodeId ?? existing?.nodeId ?? null,
      notes: payload.notes ?? existing?.notes ?? null,
      reviewerLoginId: payload.reviewerLoginId,
      reviewerName: payload.reviewerName ?? existing?.reviewerName ?? null,
      status: payload.status,
      storageKey: payload.storageKey,
      tags: payload.tags ?? existing?.tags ?? [],
      templateId: payload.templateId ?? existing?.templateId ?? null,
      updatedAt: now,
    };

    await this.setJson(this.#reviewKey(payload.auditId), nextRecord);
    return nextRecord;
  }
  /* eslint-enable complexity */

  async listReviews(): Promise<AuditReviewRecord[]> {
    const keys = await this.list(`${REVIEW_FOLDER}/`, { suffix: '.json' });
    if (keys.length === 0) {
      return [];
    }
    const records = await Promise.all(keys.map((key) => this.getJson<AuditReviewRecord>(key)));
    return records
      .map((record) => {
        const parsed = AuditReviewRecordSchema.safeParse(record);
        return parsed.success ? parsed.data : null;
      })
      .filter((record): record is AuditReviewRecord => record !== null);
  }

  async getProposal(proposalId: string): Promise<AuditProposalRecord | null> {
    const raw = await this.getJson<AuditProposalRecord>(this.#proposalKey(proposalId));
    if (raw === null) {
      return null;
    }
    const parsed = AuditProposalRecordSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  async listProposals(): Promise<AuditProposalRecord[]> {
    const keys = await this.list(`${PROPOSAL_FOLDER}/`, { suffix: '.json' });
    if (keys.length === 0) {
      return [];
    }
    const records = await Promise.all(keys.map((key) => this.getJson<AuditProposalRecord>(key)));
    return records
      .map((record) => {
        const parsed = AuditProposalRecordSchema.safeParse(record);
        return parsed.success ? parsed.data : null;
      })
      .filter((record): record is AuditProposalRecord => record !== null);
  }

  async saveProposal(record: AuditProposalRecord): Promise<AuditProposalRecord> {
    await this.setJson(this.#proposalKey(record.id), record);
    return record;
  }

  async listProposalsByTemplate(templateId: PromptTemplateId): Promise<AuditProposalRecord[]> {
    const proposals = await this.listProposals();
    return proposals.filter((entry) => entry.templateId === templateId);
  }

  #reviewKey(auditId: string): string {
    return `${REVIEW_FOLDER}/${auditId}.json`;
  }

  #proposalKey(proposalId: string): string {
    return `${PROPOSAL_FOLDER}/${proposalId}.json`;
  }
}
