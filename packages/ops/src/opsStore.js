import { createPool } from './pg';
import { AuditFeedbackStore } from './support/audit/AuditFeedbackStore';
import { AuditGroupStore } from './support/audit/AuditGroupStore';
import { AuditLogStore } from './support/audit/AuditLogStore';
import { AuditReviewStore } from './support/audit/AuditReviewStore';
import { BugReportStore } from './support/BugReportStore';
import { TokenUsageStore } from './support/TokenUsageStore';
import { ModelUsageStore } from './support/ModelUsageStore';
export class OpsStore {
    auditFeedbackStore;
    auditGroupStore;
    auditLogStore;
    auditReviewStore;
    bugReportStore;
    tokenUsageStore;
    modelUsageStore;
    constructor(options) {
        const pool = options?.pool ??
            createPool({
                connectionString: options?.connectionString,
            });
        this.auditFeedbackStore = new AuditFeedbackStore({ pool });
        this.auditGroupStore = new AuditGroupStore({ pool });
        this.auditLogStore = new AuditLogStore({ pool });
        this.auditReviewStore = new AuditReviewStore({ pool });
        this.bugReportStore = new BugReportStore({ pool });
        this.tokenUsageStore = new TokenUsageStore({ pool });
        this.modelUsageStore = new ModelUsageStore(pool);
    }
    async listAuditQueue(filters) {
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
        const reviewsByGroup = new Map();
        const feedbackByGroup = new Map();
        await Promise.all(groupIds.map(async (groupId) => {
            const reviews = await this.auditReviewStore.listByGroup(groupId);
            reviewsByGroup.set(groupId, this.#mapByAuditId(reviews));
            const feedback = await this.auditFeedbackStore.listByGroup(groupId);
            feedbackByGroup.set(groupId, this.#mapFeedbackByAuditId(feedback));
        }));
        const items = [];
        for (const { entry, groupId } of entries) {
            const review = reviewsByGroup.get(groupId)?.get(entry.id) ?? null;
            const playerFeedback = feedbackByGroup.get(groupId)?.get(entry.id) ?? [];
            items.push({ entry, feedback: playerFeedback, groupId, review });
        }
        return { cursor: nextCursor ?? null, items };
    }
    async getAuditEntry(auditId) {
        const found = await this.auditLogStore.get(auditId);
        if (found === null) {
            return null;
        }
        const reviews = await this.auditReviewStore.listByGroup(found.groupId);
        const feedback = await this.auditFeedbackStore.listByGroup(found.groupId);
        const review = reviews.find((entry) => entry.auditId === auditId) ?? null;
        // Return ALL feedback for the turn group, not just for this specific audit
        return { entry: found.entry, feedback, groupId: found.groupId, review };
    }
    async saveAuditReview(input) {
        return this.auditReviewStore.save(input);
    }
    async saveAuditFeedback(input) {
        return this.auditFeedbackStore.create(input);
    }
    // eslint-disable-next-line complexity
    toQueueItems(bundles, statusFilter) {
        const items = [];
        for (const bundle of bundles) {
            const metadata = bundle.entry.metadata;
            const item = {
                auditId: bundle.entry.id,
                chronicleId: typeof metadata?.chronicleId === 'string' ? metadata.chronicleId : null,
                createdAt: bundle.entry.createdAt,
                createdAtMs: bundle.entry.createdAtMs,
                groupId: bundle.groupId,
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
                turnId: typeof metadata?.turnId === 'string' ? metadata.turnId : null,
                turnSequence: typeof metadata?.turnSequence === 'number' ? metadata.turnSequence : null,
            };
            if (statusFilter && !statusFilter.has(item.status)) {
                continue;
            }
            items.push(item);
        }
        return items;
    }
    #mapByAuditId(rows) {
        const map = new Map();
        for (const row of rows) {
            if (typeof row.auditId === 'string') {
                map.set(row.auditId, row);
            }
        }
        return map;
    }
    #mapFeedbackByAuditId(rows) {
        const map = new Map();
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
export const createOpsStore = (options) => new OpsStore(options);
