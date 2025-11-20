/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import type { AuditReviewRecord } from '@glass-frontier/dto';
import { AuditReviewRecordSchema } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import { createPool } from '../../pg';

type AuditReviewRow = {
  id: string;
  group_id: string;
  audit_id: string;
  reviewer_id: string;
  status: string;
  severity: string;
  tags: string[];
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

export class AuditReviewStore {
  readonly #pool: Pool;

  constructor(options?: { connectionString?: string; pool?: Pool }) {
    this.#pool = createPool({
      connectionString: options?.connectionString,
      pool: options?.pool,
    });
  }

  async save(review: {
    groupId: string;
    auditId: string;
    reviewerId: string;
    status: string;
    severity: string;
    tags?: string[];
    notes?: string | null;
  }): Promise<AuditReviewRecord> {
    const id = randomUUID();
    const now = new Date();
    const payload: AuditReviewRecord = {
      auditId: review.auditId,
      completedAt: review.status === 'completed' ? now.toISOString() : null,
      createdAt: now.toISOString(),
      draftAt: null,
      id,
      nodeId: null,
      notes: review.notes ?? null,
      reviewerId: review.reviewerId,
      reviewerName: null,
      status: review.status as AuditReviewRecord['status'],
      storageKey: id,
      tags: review.tags ?? [],
      templateId: null,
      updatedAt: now.toISOString(),
    };
    const parsed = AuditReviewRecordSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error('Invalid audit review payload.');
    }
    await this.#pool.query(
      `INSERT INTO audit_review (
         id, group_id, audit_id, reviewer_id, status, severity, tags, notes, created_at, updated_at
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::text[], $8, $9, $10)`,
      [
        payload.id,
        review.groupId,
        payload.auditId,
        payload.reviewerId,
        payload.status,
        review.severity,
        payload.tags,
        payload.notes,
        payload.createdAt,
        payload.updatedAt,
      ]
    );
    return payload;
  }

  async get(reviewId: string): Promise<AuditReviewRecord | null> {
    const result = await this.#pool.query<AuditReviewRow>(
      `SELECT id, group_id, audit_id, reviewer_id, status, severity, tags, notes, created_at, updated_at
       FROM audit_review
       WHERE id = $1::uuid`,
      [reviewId]
    );
    const row = result.rows[0] ?? null;
    if (row === null) {
      return null;
    }
    return this.#mapRow(row);
  }

  async listByGroup(groupId: string): Promise<AuditReviewRecord[]> {
    const result = await this.#pool.query<AuditReviewRow>(
      `SELECT id, group_id, audit_id, reviewer_id, status, severity, tags, notes, created_at, updated_at
       FROM audit_review
       WHERE group_id = $1::uuid
       ORDER BY created_at DESC`,
      [groupId]
    );
    return result.rows
      .map((row) => this.#mapRow(row))
      .filter((entry): entry is AuditReviewRecord => entry !== null);
  }

  #mapRow(row: AuditReviewRow): AuditReviewRecord | null {
    const payload: AuditReviewRecord = {
      auditId: row.audit_id,
      completedAt: row.status === 'completed' ? row.updated_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      draftAt: row.status === 'in_progress' ? row.created_at.toISOString() : null,
      id: row.id,
      nodeId: null,
      notes: row.notes,
      reviewerId: row.reviewer_id,
      reviewerName: null,
      status: row.status as AuditReviewRecord['status'],
      storageKey: row.id,
      tags: row.tags ?? [],
      templateId: null,
      updatedAt: row.updated_at.toISOString(),
    };
    const parsed = AuditReviewRecordSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  }
}
