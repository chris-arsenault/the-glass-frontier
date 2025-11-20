/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/strict-boolean-expressions */
import type {
  AuditLogEntry,
  AuditQueueItem,
  AuditReviewRecord,
  PlayerFeedbackRecord,
} from '@glass-frontier/dto';
import type { Pool } from 'pg';

import { createPool } from './pg';
import { AuditFeedbackStore } from './support/audit/AuditFeedbackStore';
import { AuditGroupStore } from './support/audit/AuditGroupStore';
import { AuditLogStore } from './support/audit/AuditLogStore';
import { AuditReviewStore } from './support/audit/AuditReviewStore';
import { BugReportStore } from './support/BugReportStore';
import { TokenUsageStore } from './support/TokenUsageStore';

type AuditQueueFilters = {
  cursor?: string;
  endDate?: number;
  groupId?: string;
  limit?: number;
  playerId?: string;
  scopeRef?: string;
  scopeType?: string;
  search?: string;
  startDate?: number;
};

type AuditEntryBundle = {
  entry: AuditLogEntry;
  feedback: PlayerFeedbackRecord[];
  review: AuditReviewRecord | null;
  groupId: string;
};

export class OpsStore {
  readonly auditFeedbackStore: AuditFeedbackStore;
  readonly auditGroupStore: AuditGroupStore;
  readonly auditLogStore: AuditLogStore;
  readonly auditReviewStore: AuditReviewStore;
  readonly bugReportStore: BugReportStore;
  readonly tokenUsageStore: TokenUsageStore;

  constructor(options?: { connectionString?: string; pool?: Pool }) {
    const pool =
      options?.pool ??
      createPool({
        connectionString: options?.connectionString,
      });
    this.auditFeedbackStore = new AuditFeedbackStore({ pool });
    this.auditGroupStore = new AuditGroupStore({ pool });
    this.auditLogStore = new AuditLogStore({ pool });
    this.auditReviewStore = new AuditReviewStore({ pool });
    this.bugReportStore = new BugReportStore({ pool });
    this.tokenUsageStore = new TokenUsageStore({ pool });
  }

  async listAuditQueue(filters: AuditQueueFilters): Promise<{
    cursor: string | null;
    items: AuditEntryBundle[];
  }> {
    const { entries, nextCursor } = await this.auditLogStore.listRecent({
      cursor: filters.cursor,
      endDate: filters.endDate,
      groupId: filters.groupId,
      limit: filters.limit,
      playerId: filters.playerId,
      scopeRef: filters.scopeRef,
      scopeType: filters.scopeType,
      search: filters.search,
      startDate: filters.startDate,
    });
    const groupIds = Array.from(new Set(entries.map((entry) => entry.groupId)));
    const reviewsByGroup = new Map<string, Map<string, AuditReviewRecord>>();
    const feedbackByGroup = new Map<string, Map<string, PlayerFeedbackRecord[]>>();

    await Promise.all(
      groupIds.map(async (groupId) => {
        const reviews = await this.auditReviewStore.listByGroup(groupId);
        reviewsByGroup.set(groupId, this.#mapByAuditId(reviews));
        const feedback = await this.auditFeedbackStore.listByGroup(groupId);
        feedbackByGroup.set(groupId, this.#mapFeedbackByAuditId(feedback));
      })
    );

    const items: AuditEntryBundle[] = [];
    for (const { entry, groupId } of entries) {
      const review = reviewsByGroup.get(groupId)?.get(entry.id) ?? null;
      const playerFeedback = feedbackByGroup.get(groupId)?.get(entry.id) ?? [];
      items.push({ entry, feedback: playerFeedback, groupId, review });
    }

    return { cursor: nextCursor ?? null, items };
  }

  async getAuditEntry(auditId: string): Promise<AuditEntryBundle | null> {
    const found = await this.auditLogStore.get(auditId);
    if (found === null) {
      return null;
    }
    const reviews = await this.auditReviewStore.listByGroup(found.groupId);
    const feedback = await this.auditFeedbackStore.listByGroup(found.groupId);
    const review = reviews.find((entry) => entry.auditId === auditId) ?? null;
    const playerFeedback = feedback.filter((entry) => entry.auditId === auditId);
    return { entry: found.entry, feedback: playerFeedback, groupId: found.groupId, review };
  }

  async saveAuditReview(input: {
    auditId: string;
    groupId: string;
    reviewerId: string;
    status: string;
    severity: string;
    tags?: string[];
    notes?: string | null;
  }): Promise<AuditReviewRecord> {
    return this.auditReviewStore.save(input);
  }

  async saveAuditFeedback(
    input: Parameters<AuditFeedbackStore['create']>[0]
  ): Promise<PlayerFeedbackRecord> {
    return this.auditFeedbackStore.create(input);
  }

  // eslint-disable-next-line complexity
  toQueueItems(
    bundles: AuditEntryBundle[],
    statusFilter: Set<AuditReviewRecord['status']> | null
  ): AuditQueueItem[] {
    const items: AuditQueueItem[] = [];
    for (const bundle of bundles) {
      const item: AuditQueueItem = {
        auditId: bundle.entry.id,
        createdAt: bundle.entry.createdAt,
        createdAtMs: bundle.entry.createdAtMs,
        nodeId: bundle.entry.nodeId ?? null,
        notes: bundle.review?.notes ?? null,
        playerFeedback: bundle.feedback,
        playerId: bundle.entry.playerId ?? null,
        providerId: bundle.entry.providerId ?? null,
        requestContextId: bundle.entry.requestContextId ?? null,
        reviewerId: bundle.review?.reviewerId ?? null,
        reviewerName: bundle.review?.reviewerName ?? null,
        status: bundle.review?.status ?? 'unreviewed',
        storageKey: bundle.entry.storageKey,
        tags: bundle.review?.tags ?? [],
        templateId: bundle.review?.templateId ?? null,
      };
      if (statusFilter && !statusFilter.has(item.status)) {
        continue;
      }
      items.push(item);
    }
    return items;
  }

  #mapByAuditId<T extends { auditId: string | null }>(rows: T[]): Map<string, T> {
    const map = new Map<string, T>();
    for (const row of rows) {
      if (typeof row.auditId === 'string') {
        map.set(row.auditId, row);
      }
    }
    return map;
  }

  #mapFeedbackByAuditId(rows: PlayerFeedbackRecord[]): Map<string, PlayerFeedbackRecord[]> {
    const map = new Map<string, PlayerFeedbackRecord[]>();
    for (const row of rows) {
      const auditId = row.auditId;
      if (typeof auditId !== 'string') {
        continue;
      }
      const list = map.get(auditId) ?? [];
      list.push(row);
      map.set(auditId, list);
    }
    return map;
  }
}

export const createOpsStore = (options?: { connectionString?: string; pool?: Pool }): OpsStore =>
  new OpsStore(options);
