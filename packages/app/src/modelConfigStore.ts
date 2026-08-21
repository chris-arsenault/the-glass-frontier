import type { Pool } from 'pg';

import type { ReasoningEffort } from './modelCatalog';

export type ModelConfig = {
  modelId: string;
  apiModelId: string;
  displayName: string;
  providerId: string;
  isEnabled: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  reasoningEfforts: ReasoningEffort[];
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

type UsageCostRow = {
  model_id: string;
  display_name: string;
  provider_id: string;
  input_tokens: string;
  output_tokens: string;
  request_count: string;
  cost_per_1k_input: string;
  cost_per_1k_output: string;
};

type UsageRecord = {
  playerId: string;
  modelId: string;
  providerId: string;
  inputTokens: number;
  outputTokens: number;
};

const toUsageWithCost = (row: UsageCostRow): ModelUsageWithCost => {
  const inputTokens = parseInt(row.input_tokens, 10);
  const outputTokens = parseInt(row.output_tokens, 10);
  const inputCost = (inputTokens / 1000) * parseFloat(row.cost_per_1k_input);
  const outputCost = (outputTokens / 1000) * parseFloat(row.cost_per_1k_output);

  return {
    displayName: row.display_name,
    inputCost,
    inputTokens,
    modelId: row.model_id,
    outputCost,
    outputTokens,
    providerId: row.provider_id,
    requestCount: parseInt(row.request_count, 10),
    totalCost: inputCost + outputCost,
  };
};

const summarizeUsage = (byModel: ModelUsageWithCost[]): UsageCostSummary => ({
  byModel,
  totalCost: byModel.reduce((sum, model) => sum + model.totalCost, 0),
  totalInputTokens: byModel.reduce((sum, model) => sum + model.inputTokens, 0),
  totalOutputTokens: byModel.reduce((sum, model) => sum + model.outputTokens, 0),
  totalRequests: byModel.reduce((sum, model) => sum + model.requestCount, 0),
});

export class ModelConfigStore {
  readonly #pool: Pool;

  constructor(options: { pool: Pool }) {
    this.#pool = options.pool;
  }

  async listModels(): Promise<ModelConfig[]> {
    const result = await this.#pool.query<{
      model_id: string;
      api_model_id: string;
      display_name: string;
      provider_id: string;
      is_enabled: boolean;
      context_window: number;
      max_output_tokens: number;
      cost_per_1k_input: string;
      cost_per_1k_output: string;
      reasoning_efforts: ReasoningEffort[];
      updated_at: Date;
    }>('SELECT * FROM app.model_config WHERE is_enabled = true ORDER BY display_name');

    return result.rows.map((row) => ({
      apiModelId: row.api_model_id,
      contextWindow: row.context_window,
      costPer1kInput: parseFloat(row.cost_per_1k_input),
      costPer1kOutput: parseFloat(row.cost_per_1k_output),
      displayName: row.display_name,
      isEnabled: row.is_enabled,
      maxOutputTokens: row.max_output_tokens,
      modelId: row.model_id,
      providerId: row.provider_id,
      reasoningEfforts: row.reasoning_efforts,
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

  async recordUsage(record: UsageRecord): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ops.model_usage (player_id, model_id, provider_id, input_tokens, output_tokens, request_count, date)
       VALUES ($1, $2, $3, $4, $5, 1, CURRENT_DATE)
       ON CONFLICT (player_id, model_id, date)
       DO UPDATE SET
         input_tokens = ops.model_usage.input_tokens + EXCLUDED.input_tokens,
         output_tokens = ops.model_usage.output_tokens + EXCLUDED.output_tokens,
         request_count = ops.model_usage.request_count + 1,
         updated_at = now()`,
      [
        record.playerId,
        record.modelId,
        record.providerId,
        record.inputTokens,
        record.outputTokens,
      ]
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
      createdAt: row.created_at,
      date: row.date,
      id: row.id,
      inputTokens: parseInt(row.input_tokens, 10),
      modelId: row.model_id,
      outputTokens: parseInt(row.output_tokens, 10),
      playerId: row.player_id,
      providerId: row.provider_id,
      requestCount: parseInt(row.request_count, 10),
      updatedAt: row.updated_at,
    }));
  }

  async getUsageCostSummary(
    playerId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<UsageCostSummary> {
    const result = await this.#pool.query<UsageCostRow>(
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
       LEFT JOIN app.model_config mc ON mu.model_id = mc.model_id
       WHERE mu.player_id = $1
         AND ($2::date IS NULL OR mu.date >= $2)
         AND ($3::date IS NULL OR mu.date <= $3)
       GROUP BY mu.model_id, mc.display_name, mu.provider_id, mc.cost_per_1k_input, mc.cost_per_1k_output
       ORDER BY SUM(mu.input_tokens + mu.output_tokens) DESC`,
      [playerId, startDate ?? null, endDate ?? null]
    );

    return summarizeUsage(result.rows.map(toUsageWithCost));
  }
}
