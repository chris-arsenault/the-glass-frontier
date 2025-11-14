import type { PlayerFeedbackRecord, PlayerFeedbackSentiment } from '@glass-frontier/dto';
import { PlayerFeedbackRecordSchema } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';

import { HybridObjectStore } from '../hybridObjectStore';

const DEFAULT_PREFIX = '_llm-audit';
const FEEDBACK_FOLDER = 'feedback';

export type SaveFeedbackPayload = {
  auditId: string;
  chronicleId: string;
  comment?: string | null;
  gmEntryId: string;
  playerId?: string | null;
  playerLoginId: string;
  sentiment: PlayerFeedbackSentiment;
  turnId: string;
  turnSequence: number;
};

export class AuditFeedbackStore extends HybridObjectStore {
  constructor(options: { bucket: string; prefix?: string | null; region?: string }) {
    super({
      bucket: options.bucket,
      prefix: options.prefix ?? DEFAULT_PREFIX,
      region: options.region,
    });
  }

  async saveFeedback(payload: SaveFeedbackPayload): Promise<PlayerFeedbackRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const record: PlayerFeedbackRecord = {
      auditId: payload.auditId,
      chronicleId: payload.chronicleId,
      comment: payload.comment ?? null,
      createdAt: now,
      gmEntryId: payload.gmEntryId,
      id,
      metadata: undefined,
      playerId: payload.playerId ?? null,
      playerLoginId: payload.playerLoginId,
      sentiment: payload.sentiment,
      turnId: payload.turnId,
      turnSequence: payload.turnSequence,
      updatedAt: now,
    };

    await this.setJson(this.#feedbackKey(payload.auditId, id), record);
    return record;
  }

  async listFeedbackForAudit(auditId: string): Promise<PlayerFeedbackRecord[]> {
    const prefix = this.#auditFolder(auditId);
    const keys = await this.list(prefix, { suffix: '.json' });
    if (keys.length === 0) {
      return [];
    }
    const records = await Promise.all(keys.map((key) => this.getJson<PlayerFeedbackRecord>(key)));
    return records
      .map((record) => {
        const parsed = PlayerFeedbackRecordSchema.safeParse(record);
        return parsed.success ? parsed.data : null;
      })
      .filter((record): record is PlayerFeedbackRecord => record !== null)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  async listFeedbackForAudits(auditIds: string[]): Promise<Map<string, PlayerFeedbackRecord[]>> {
    const results = new Map<string, PlayerFeedbackRecord[]>();
    await Promise.all(
      auditIds.map(async (auditId) => {
        const entries = await this.listFeedbackForAudit(auditId);
        results.set(auditId, entries);
      })
    );
    return results;
  }

  #auditFolder(auditId: string): string {
    return `${FEEDBACK_FOLDER}/${auditId}/`;
  }

  #feedbackKey(auditId: string, feedbackId: string): string {
    return `${FEEDBACK_FOLDER}/${auditId}/${feedbackId}.json`;
  }
}
