import { PlayerFeedbackRecordSchema } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import { createPool } from '../../pg';
export class AuditFeedbackStore {
    #pool;
    constructor(options) {
        this.#pool = createPool({
            connectionString: options?.connectionString,
            pool: options?.pool,
        });
    }
    async create(feedback) {
        const now = new Date().toISOString();
        const record = {
            auditId: feedback.auditId ?? null,
            chronicleId: feedback.chronicleId,
            comment: feedback.comment ?? null,
            createdAt: now,
            expectedIntentType: feedback.expectedIntentType ?? null,
            expectedInventoryDelta: feedback.expectedInventoryDelta ?? null,
            expectedInventoryNotes: feedback.expectedInventoryNotes ?? null,
            expectedLocationChange: feedback.expectedLocationChange ?? null,
            expectedLocationNotes: feedback.expectedLocationNotes ?? null,
            expectedSkillCheck: feedback.expectedSkillCheck ?? null,
            expectedSkillNotes: feedback.expectedSkillNotes ?? null,
            gmEntryId: feedback.gmEntryId,
            groupId: feedback.groupId,
            id: randomUUID(),
            metadata: feedback.metadata ?? {},
            playerId: feedback.playerId,
            sentiment: feedback.sentiment,
            turnId: feedback.turnId,
            turnSequence: feedback.turnSequence,
            updatedAt: now,
        };
        const parsed = PlayerFeedbackRecordSchema.safeParse(record);
        if (!parsed.success) {
            throw new Error('Invalid player feedback payload.');
        }
        await this.#pool.query(`INSERT INTO ops.audit_feedback (
         id, group_id, audit_id, player_id, sentiment, note, comment, chronicle_id, turn_id, turn_sequence, gm_entry_id,
         expected_intent_type, expected_inventory_delta, expected_inventory_notes, expected_location_change, expected_location_notes,
         expected_skill_check, expected_skill_notes, metadata, created_at, updated_at
       )
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::uuid, $9::uuid, $10, $11,
               $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20, $21)`, [
            record.id,
            feedback.groupId,
            feedback.auditId ?? null,
            record.playerId,
            record.sentiment,
            feedback.note ?? null,
            record.comment,
            record.chronicleId,
            record.turnId,
            record.turnSequence,
            record.gmEntryId,
            record.expectedIntentType,
            record.expectedInventoryDelta,
            record.expectedInventoryNotes,
            record.expectedLocationChange,
            record.expectedLocationNotes,
            record.expectedSkillCheck,
            record.expectedSkillNotes,
            JSON.stringify(record.metadata ?? {}),
            record.createdAt,
            record.updatedAt,
        ]);
        return record;
    }
    async listByGroup(groupId) {
        const result = await this.#pool.query(`SELECT id, group_id, audit_id, player_id, sentiment, note, comment, chronicle_id, turn_id, turn_sequence, gm_entry_id,
              expected_intent_type, expected_inventory_delta, expected_inventory_notes, expected_location_change, expected_location_notes,
              expected_skill_check, expected_skill_notes, metadata, created_at, updated_at
       FROM ops.audit_feedback
       WHERE group_id = $1::uuid
       ORDER BY created_at DESC`, [groupId]);
        return result.rows
            .map((row) => this.#mapRow(row))
            .filter((entry) => entry !== null);
    }
    #mapRow(row) {
        const parsed = PlayerFeedbackRecordSchema.safeParse({
            auditId: row.audit_id ?? null,
            chronicleId: row.chronicle_id,
            comment: row.comment,
            createdAt: row.created_at.toISOString(),
            expectedIntentType: row.expected_intent_type ?? null,
            expectedInventoryDelta: row.expected_inventory_delta ?? null,
            expectedInventoryNotes: row.expected_inventory_notes ?? null,
            expectedLocationChange: row.expected_location_change ?? null,
            expectedLocationNotes: row.expected_location_notes ?? null,
            expectedSkillCheck: row.expected_skill_check ?? null,
            expectedSkillNotes: row.expected_skill_notes ?? null,
            gmEntryId: row.gm_entry_id,
            groupId: row.group_id,
            id: row.id,
            metadata: row.metadata ?? undefined,
            playerId: row.player_id,
            sentiment: row.sentiment,
            turnId: row.turn_id,
            turnSequence: row.turn_sequence ?? 0,
            updatedAt: row.updated_at.toISOString(),
        });
        return parsed.success ? parsed.data : null;
    }
}
