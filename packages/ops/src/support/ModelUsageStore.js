import { log } from '@glass-frontier/utils';
export class ModelUsageStore {
    #pool;
    constructor(pool) {
        this.#pool = pool;
    }
    async recordUsage(record) {
        try {
            await this.#pool.query(`INSERT INTO ops.model_usage
         (player_id, model_id, provider_id, input_tokens, output_tokens, request_count, date)
         VALUES ($1, $2, $3, $4, $5, 1, CURRENT_DATE)
         ON CONFLICT (player_id, model_id, date)
         DO UPDATE SET
           input_tokens = ops.model_usage.input_tokens + EXCLUDED.input_tokens,
           output_tokens = ops.model_usage.output_tokens + EXCLUDED.output_tokens,
           request_count = ops.model_usage.request_count + 1,
           updated_at = now()`, [
                record.playerId,
                record.modelId,
                record.providerId,
                record.inputTokens,
                record.outputTokens,
            ]);
        }
        catch (error) {
            log('error', 'model_usage.record_failed', {
                message: error instanceof Error ? error.message : 'unknown',
                playerId: record.playerId,
                modelId: record.modelId,
            });
            throw error;
        }
    }
}
