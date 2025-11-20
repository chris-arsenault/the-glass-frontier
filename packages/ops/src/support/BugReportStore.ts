/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import type { BugReport } from '@glass-frontier/dto';
import { BugReportSchema } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import { createPool } from '../pg';

export type CreateBugReportPayload = {
  summary: string;
  details: string;
  playerId: string;
  chronicleId?: string | null;
  characterId?: string | null;
  metadata?: Record<string, unknown>;
};

export type UpdateBugReportPayload = {
  adminNotes?: string | null;
  backlogItem?: string | null;
  status?: BugReport['status'];
};

type BugReportRow = {
  id: string;
  player_id: string;
  summary: string;
  details: string;
  status: string;
  chronicle_id: string | null;
  character_id: string | null;
  admin_notes: string | null;
  backlog_item: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

const normalizeOptionalText = (value?: string | null): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export class BugReportStore {
  readonly #pool: Pool;

  constructor(options?: { connectionString?: string; pool?: Pool }) {
    this.#pool = createPool({
      connectionString: options?.connectionString,
      pool: options?.pool,
    });
  }

  async createReport(payload: CreateBugReportPayload): Promise<BugReport> {
    const now = new Date();
    const report: BugReport = {
      adminNotes: null,
      backlogItem: null,
      characterId: payload.characterId ?? null,
      chronicleId: payload.chronicleId ?? null,
      createdAt: now.toISOString(),
      details: payload.details,
      id: randomUUID(),
      metadata: payload.metadata,
      playerId: payload.playerId,
      status: 'open',
      summary: payload.summary,
      updatedAt: now.toISOString(),
    };
    await this.#pool.query(
      `INSERT INTO bug_report (
         id, player_id, summary, details, status, chronicle_id, character_id, admin_notes, backlog_item, metadata, created_at, updated_at
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7::uuid, $8, $9, $10::jsonb, $11, $12)`,
      [
        report.id,
        report.playerId,
        report.summary,
        report.details,
        report.status,
        report.chronicleId,
        report.characterId,
        report.adminNotes,
        report.backlogItem,
        JSON.stringify(report.metadata ?? {}),
        report.createdAt,
        report.updatedAt,
      ]
    );
    return report;
  }

  async updateReport(reportId: string, payload: UpdateBugReportPayload): Promise<BugReport> {
    const existing = await this.getReport(reportId);
    if (existing === null) {
      throw new Error('Bug report not found.');
    }
    const now = new Date();
    const normalizedAdminNotes = normalizeOptionalText(payload.adminNotes);
    const normalizedBacklogItem = normalizeOptionalText(payload.backlogItem);
    const report: BugReport = {
      ...existing,
      adminNotes:
        normalizedAdminNotes === undefined
          ? existing.adminNotes ?? null
          : normalizedAdminNotes,
      backlogItem:
        normalizedBacklogItem === undefined
          ? existing.backlogItem ?? null
          : normalizedBacklogItem,
      status: payload.status ?? existing.status,
      updatedAt: now.toISOString(),
    };
    await this.#pool.query(
      `UPDATE bug_report
       SET admin_notes = $2,
           backlog_item = $3,
           status = $4,
           updated_at = $5
       WHERE id = $1::uuid`,
      [
        report.id,
        report.adminNotes,
        report.backlogItem,
        report.status,
        report.updatedAt,
      ]
    );
    return report;
  }

  async getReport(reportId: string): Promise<BugReport | null> {
    const result = await this.#pool.query<BugReportRow>(
      `SELECT id, player_id, summary, details, status, chronicle_id, character_id, admin_notes, backlog_item, metadata, created_at, updated_at
       FROM bug_report
       WHERE id = $1::uuid`,
      [reportId]
    );
    const row = result.rows[0] ?? null;
    if (row === null) {
      return null;
    }
    return this.#mapRow(row);
  }

  async listReports(): Promise<BugReport[]> {
    const result = await this.#pool.query<BugReportRow>(
      `SELECT id, player_id, summary, details, status, chronicle_id, character_id, admin_notes, backlog_item, metadata, created_at, updated_at
       FROM bug_report
       ORDER BY created_at DESC`
    );
    return result.rows
      .map((row) => this.#mapRow(row))
      .filter((entry): entry is BugReport => entry !== null);
  }

  #mapRow(row: BugReportRow): BugReport | null {
    const record: BugReport = {
      adminNotes: row.admin_notes,
      backlogItem: row.backlog_item,
      characterId: row.character_id,
      chronicleId: row.chronicle_id,
      createdAt: row.created_at.toISOString(),
      details: row.details,
      id: row.id,
      metadata: row.metadata ?? undefined,
      playerId: row.player_id,
      status: row.status as BugReport['status'],
      summary: row.summary,
      updatedAt: row.updated_at.toISOString(),
    };
    const parsed = BugReportSchema.safeParse(record);
    return parsed.success ? parsed.data : null;
  }
}
