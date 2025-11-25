import type { Pool } from 'pg';

export type ModelConfig = {
  modelId: string;
  apiModelId: string | null;
  displayName: string;
  providerId: string;
  isEnabled: boolean;
  maxTokens: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  supportsReasoning: boolean;
  metadata: Record<string, unknown>;
  updatedAt: Date;
};

export type ModelCategory = 'prose' | 'classification';

export type ModelCategoryConfig = {
  id: string;
  category: ModelCategory;
  modelId: string;
  playerId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ModelUsage = {
  id: string;
  playerId: string;
  modelId: string;
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type ModelUsageWithCost = {
  modelId: string;
  displayName: string;
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
};

export type UsageCostSummary = {
  byModel: ModelUsageWithCost[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalRequests: number;
  totalCost: number;
};

export class ModelConfigStore {
  readonly #pool: Pool;

  constructor(options: { pool: Pool }) {
    this.#pool = options.pool;
  }

  async listModels(): Promise<ModelConfig[]> {
    const result = await this.#pool.query<{
      model_id: string;
      api_model_id: string | null;
      display_name: string;
      provider_id: string;
      is_enabled: boolean;
      max_tokens: number;
      cost_per_1k_input: string;
      cost_per_1k_output: string;
      supports_reasoning: boolean;
      metadata: Record<string, unknown>;
      updated_at: Date;
    }>('SELECT * FROM app.model_config WHERE is_enabled = true ORDER BY display_name');

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

  async getModelForCategory(category: ModelCategory, playerId?: string): Promise<string> {
    const result = await this.#pool.query<{ model_id: string }>(
      `SELECT mcc.model_id
       FROM app.model_category_config mcc
       WHERE mcc.category = $1
         AND (mcc.player_id = $2 OR mcc.player_id IS NULL)
       ORDER BY mcc.player_id NULLS LAST
       LIMIT 1`,
      [category, playerId ?? null]
    );

    if (result.rows.length === 0) {
      throw new Error(`No model configured for category: ${category}`);
    }

    return result.rows[0].model_id;
  }

  async setCategoryModel(
    category: ModelCategory,
    modelId: string,
    playerId?: string
  ): Promise<void> {
    await this.#pool.query(
      `INSERT INTO app.model_category_config (category, model_id, player_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (category, player_id)
       DO UPDATE SET model_id = EXCLUDED.model_id, updated_at = now()`,
      [category, modelId, playerId ?? null]
    );
  }

  async recordUsage(
    playerId: string,
    modelId: string,
    providerId: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ops.model_usage (player_id, model_id, provider_id, input_tokens, output_tokens, request_count, date)
       VALUES ($1, $2, $3, $4, $5, 1, CURRENT_DATE)
       ON CONFLICT (player_id, model_id, date)
       DO UPDATE SET
         input_tokens = ops.model_usage.input_tokens + EXCLUDED.input_tokens,
         output_tokens = ops.model_usage.output_tokens + EXCLUDED.output_tokens,
         request_count = ops.model_usage.request_count + 1,
         updated_at = now()`,
      [playerId, modelId, providerId, inputTokens, outputTokens]
    );
  }

  async getUsageByPlayer(
    playerId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<ModelUsage[]> {
    const result = await this.#pool.query<{
      id: string;
      player_id: string;
      model_id: string;
      provider_id: string;
      input_tokens: string;
      output_tokens: string;
      request_count: string;
      date: Date;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM ops.model_usage
       WHERE player_id = $1
         AND ($2::date IS NULL OR date >= $2)
         AND ($3::date IS NULL OR date <= $3)
       ORDER BY date DESC`,
      [playerId, startDate ?? null, endDate ?? null]
    );

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

  async upsertModel(config: Omit<ModelConfig, 'metadata' | 'updatedAt'>): Promise<void> {
    await this.#pool.query(
      `INSERT INTO app.model_config
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
           updated_at = now()`,
      [
        config.modelId,
        config.apiModelId,
        config.displayName,
        config.providerId,
        config.isEnabled,
        config.maxTokens,
        config.costPer1kInput,
        config.costPer1kOutput,
        config.supportsReasoning,
      ]
    );
  }

  async getUsageCostSummary(
    playerId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<UsageCostSummary> {
    const result = await this.#pool.query<{
      model_id: string;
      display_name: string;
      provider_id: string;
      input_tokens: string;
      output_tokens: string;
      request_count: string;
      cost_per_1k_input: string;
      cost_per_1k_output: string;
    }>(
      `SELECT
         mu.model_id,
         COALESCE(mc.display_name, mu.model_id) as display_name,
         mu.provider_id,
         SUM(mu.input_tokens)::text as input_tokens,
         SUM(mu.output_tokens)::text as output_tokens,
         SUM(mu.request_count)::text as request_count,
         COALESCE(mc.cost_per_1k_input, '0')::text as cost_per_1k_input,
         COALESCE(mc.cost_per_1k_output, '0')::text as cost_per_1k_output
       FROM ops.model_usage mu
       LEFT JOIN app.model_config mc ON (mu.model_id = mc.model_id OR mu.model_id = mc.api_model_id)
       WHERE mu.player_id = $1
         AND ($2::date IS NULL OR mu.date >= $2)
         AND ($3::date IS NULL OR mu.date <= $3)
       GROUP BY mu.model_id, mc.display_name, mu.provider_id, mc.cost_per_1k_input, mc.cost_per_1k_output
       ORDER BY SUM(mu.input_tokens + mu.output_tokens) DESC`,
      [playerId, startDate ?? null, endDate ?? null]
    );

    const byModel: ModelUsageWithCost[] = result.rows.map((row) => {
      const inputTokens = parseInt(row.input_tokens, 10);
      const outputTokens = parseInt(row.output_tokens, 10);
      const costPer1kInput = parseFloat(row.cost_per_1k_input);
      const costPer1kOutput = parseFloat(row.cost_per_1k_output);
      const inputCost = (inputTokens / 1000) * costPer1kInput;
      const outputCost = (outputTokens / 1000) * costPer1kOutput;

      return {
        modelId: row.model_id,
        displayName: row.display_name,
        providerId: row.provider_id,
        inputTokens,
        outputTokens,
        requestCount: parseInt(row.request_count, 10),
        inputCost,
        outputCost,
        totalCost: inputCost + outputCost,
      };
    });

    const totalInputTokens = byModel.reduce((sum, m) => sum + m.inputTokens, 0);
    const totalOutputTokens = byModel.reduce((sum, m) => sum + m.outputTokens, 0);
    const totalRequests = byModel.reduce((sum, m) => sum + m.requestCount, 0);
    const totalCost = byModel.reduce((sum, m) => sum + m.totalCost, 0);

    return {
      byModel,
      totalInputTokens,
      totalOutputTokens,
      totalRequests,
      totalCost,
    };
  }
}
