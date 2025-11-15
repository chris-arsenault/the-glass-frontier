import type { BugReport } from '@glass-frontier/dto';
import { BugReportSchema } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';

import { HybridObjectStore } from '../hybridObjectStore';

const DEFAULT_PREFIX = '_support';
const REPORT_FOLDER = 'bug-reports';

export type CreateBugReportPayload = {
  summary: string;
  details: string;
  loginId: string;
  chronicleId?: string | null;
  characterId?: string | null;
  playerId?: string | null;
};

export type UpdateBugReportPayload = {
  adminNotes?: string | null;
  backlogItem?: string | null;
  status?: BugReport['status'];
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

export class BugReportStore extends HybridObjectStore {
  constructor(options: { bucket: string; prefix?: string | null; region?: string }) {
    super({
      bucket: options.bucket,
      prefix: options.prefix ?? DEFAULT_PREFIX,
      region: options.region,
    });
  }

  async createReport(payload: CreateBugReportPayload): Promise<BugReport> {
    const now = new Date().toISOString();
    const report: BugReport = {
      adminNotes: null,
      backlogItem: null,
      characterId: payload.characterId ?? null,
      chronicleId: payload.chronicleId ?? null,
      createdAt: now,
      details: payload.details,
      id: randomUUID(),
      loginId: payload.loginId,
      metadata: undefined,
      playerId: payload.playerId ?? null,
      status: 'open',
      summary: payload.summary,
      updatedAt: now,
    };
    await this.setJson(this.#reportKey(report.id), report);
    return report;
  }

  async updateReport(reportId: string, payload: UpdateBugReportPayload): Promise<BugReport> {
    const existing = await this.getReport(reportId);
    if (existing === null) {
      throw new Error('Bug report not found.');
    }
    const now = new Date().toISOString();
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
      updatedAt: now,
    };
    await this.setJson(this.#reportKey(reportId), report);
    return report;
  }

  async getReport(reportId: string): Promise<BugReport | null> {
    const stored = await this.getJson<BugReport>(this.#reportKey(reportId));
    if (stored === null) {
      return null;
    }
    const parsed = BugReportSchema.safeParse(stored);
    return parsed.success ? parsed.data : null;
  }

  async listReports(): Promise<BugReport[]> {
    const keys = await this.list(`${REPORT_FOLDER}/`, { suffix: '.json' });
    if (keys.length === 0) {
      return [];
    }
    const entries = await Promise.all(keys.map((key) => this.getJson<BugReport>(key)));
    return entries
      .map((entry) => {
        const parsed = BugReportSchema.safeParse(entry);
        return parsed.success ? parsed.data : null;
      })
      .filter((entry): entry is BugReport => entry !== null)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  #reportKey(reportId: string): string {
    return `${REPORT_FOLDER}/${reportId}.json`;
  }
}
