export class ModelConfigStore {
    #pool;
    constructor(options) {
        this.#pool = options.pool;
    }
    async listModels() {
        const result = await this.#pool.query('SELECT * FROM app.model_config WHERE is_enabled = true ORDER BY display_name');
        return result.rows.map((row) => ({
            modelId: row.model_id,
            apiModelId: row.api_model_id,
            displayName: row.display_name,
            providerId: row.provider_id,
            isEnabled: row.is_enabled,
            maxTokens: row.max_tokens,
            costPer1kInput: parseFloat(row.cost_per_1k_input),
            costPer1kOutput: parseFloat(row.cost_per_1k_output),
            supportsReasoning: row.supports_reasoning,
            metadata: row.metadata,
            updatedAt: row.updated_at,
        }));
    }
    async getModelForCategory(category, playerId) {
        const result = await this.#pool.query(`SELECT mcc.model_id, mc.api_model_id
       FROM app.model_category_config mcc
       JOIN app.model_config mc ON mcc.model_id = mc.model_id
       WHERE mcc.category = $1
         AND (mcc.player_id = $2 OR mcc.player_id IS NULL)
       ORDER BY mcc.player_id NULLS LAST
       LIMIT 1`, [category, playerId ?? null]);
        if (result.rows.length === 0) {
            throw new Error(`No model configured for category: ${category}`);
        }
        // Return api_model_id if present, otherwise fall back to model_id
        return result.rows[0].api_model_id ?? result.rows[0].model_id;
    }
    async setCategoryModel(category, modelId, playerId) {
        await this.#pool.query(`INSERT INTO app.model_category_config (category, model_id, player_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (category, player_id)
       DO UPDATE SET model_id = EXCLUDED.model_id, updated_at = now()`, [category, modelId, playerId ?? null]);
    }
    async recordUsage(playerId, modelId, providerId, inputTokens, outputTokens) {
        await this.#pool.query(`INSERT INTO ops.model_usage (player_id, model_id, provider_id, input_tokens, output_tokens, request_count, date)
       VALUES ($1, $2, $3, $4, $5, 1, CURRENT_DATE)
       ON CONFLICT (player_id, model_id, date)
       DO UPDATE SET
         input_tokens = ops.model_usage.input_tokens + EXCLUDED.input_tokens,
         output_tokens = ops.model_usage.output_tokens + EXCLUDED.output_tokens,
         request_count = ops.model_usage.request_count + 1,
         updated_at = now()`, [playerId, modelId, providerId, inputTokens, outputTokens]);
    }
    async getUsageByPlayer(playerId, startDate, endDate) {
        const result = await this.#pool.query(`SELECT * FROM ops.model_usage
       WHERE player_id = $1
         AND ($2::date IS NULL OR date >= $2)
         AND ($3::date IS NULL OR date <= $3)
       ORDER BY date DESC`, [playerId, startDate ?? null, endDate ?? null]);
        return result.rows.map((row) => ({
            id: row.id,
            playerId: row.player_id,
            modelId: row.model_id,
            providerId: row.provider_id,
            inputTokens: parseInt(row.input_tokens, 10),
            outputTokens: parseInt(row.output_tokens, 10),
            requestCount: parseInt(row.request_count, 10),
            date: row.date,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }
    async upsertModel(config) {
        await this.#pool.query(`INSERT INTO app.model_config
       (model_id, api_model_id, display_name, provider_id, is_enabled, max_tokens, cost_per_1k_input, cost_per_1k_output, supports_reasoning)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (model_id) DO UPDATE
       SET api_model_id = EXCLUDED.api_model_id,
           display_name = EXCLUDED.display_name,
           provider_id = EXCLUDED.provider_id,
           is_enabled = EXCLUDED.is_enabled,
           max_tokens = EXCLUDED.max_tokens,
           cost_per_1k_input = EXCLUDED.cost_per_1k_input,
           cost_per_1k_output = EXCLUDED.cost_per_1k_output,
           supports_reasoning = EXCLUDED.supports_reasoning,
           updated_at = now()`, [
            config.modelId,
            config.apiModelId,
            config.displayName,
            config.providerId,
            config.isEnabled,
            config.maxTokens,
            config.costPer1kInput,
            config.costPer1kOutput,
            config.supportsReasoning,
        ]);
    }
}
