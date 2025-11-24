/* eslint-disable no-undef, @typescript-eslint/no-require-imports */

exports.shorthands = undefined;

exports.up = async (pgm) => {
  pgm.createTable(
    { schema: 'app', name: 'model_config' },
    {
      model_id: { type: 'text', primaryKey: true, comment: 'User-facing model ID (e.g., claude-haiku-4.5)' },
      api_model_id: { type: 'text', notNull: false, comment: 'Actual API model ID (e.g., claude-haiku-4-5-20251001). Falls back to model_id if null.' },
      display_name: { type: 'text', notNull: true },
      provider_id: { type: 'text', notNull: true },
      is_enabled: { type: 'boolean', notNull: true, default: true },
      max_tokens: { type: 'integer', notNull: true },
      cost_per_1k_input: { type: 'numeric(10,6)', notNull: true },
      cost_per_1k_output: { type: 'numeric(10,6)', notNull: true },
      supports_reasoning: { type: 'boolean', notNull: true, default: false },
      metadata: { type: 'jsonb', default: '{}' },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    { schema: 'app', name: 'model_category_config' },
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('uuid_generate_v4()'),
      },
      category: {
        type: 'text',
        notNull: true,
        comment: 'Model category: prose or classification',
      },
      model_id: {
        type: 'text',
        notNull: true,
        references: '"app"."model_config"(model_id)',
        onDelete: 'CASCADE',
      },
      player_id: {
        type: 'text',
        notNull: false,
        references: '"app"."player"(id)',
        onDelete: 'CASCADE',
        comment: 'If null, this is the global default for the category',
      },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { ifNotExists: true }
  );

  pgm.createIndex(
    { schema: 'app', name: 'model_category_config' },
    ['category', 'player_id'],
    {
      name: 'model_category_config_unique_idx',
      unique: true,
      ifNotExists: true,
    }
  );

  seedModelConfigs(pgm);
  seedDefaultCategoryConfigs(pgm);
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'app', name: 'model_category_config' }, { ifExists: true });
  pgm.dropTable({ schema: 'app', name: 'model_config' }, { ifExists: true });
};

function seedModelConfigs(pgm) {
  const models = [
    {
      model_id: 'gpt-5-nano',
      display_name: 'GPT-5 Nano',
      provider_id: 'openai',
      max_tokens: 8192,
      cost_per_1k_input: 0.00015, // $0.15/M input
      cost_per_1k_output: 0.0006, // $0.60/M output
      supports_reasoning: false,
    },
    {
      model_id: 'gpt-5-mini',
      display_name: 'GPT-5 Mini',
      provider_id: 'openai',
      max_tokens: 16384,
      cost_per_1k_input: 0.0025, // $2.50/M input
      cost_per_1k_output: 0.01, // $10.00/M output
      supports_reasoning: true,
    },
    {
      model_id: 'gpt-4.1-mini',
      display_name: 'GPT-4.1 Mini',
      provider_id: 'openai',
      max_tokens: 128000,
      cost_per_1k_input: 0.01, // $10.00/M input
      cost_per_1k_output: 0.03, // $30.00/M output
      supports_reasoning: true,
    },
    {
      model_id: 'claude-haiku-4.5',
      api_model_id: 'claude-haiku-4-5-20251001',
      display_name: 'Claude Haiku 4.5',
      provider_id: 'anthropic',
      max_tokens: 200000,
      cost_per_1k_input: 0.0008, // $0.80/M input
      cost_per_1k_output: 0.004, // $4.00/M output
      supports_reasoning: false,
    },
    {
      model_id: 'claude-sonnet-4.5',
      api_model_id: 'claude-sonnet-4-5-20250929',
      display_name: 'Claude Sonnet 4.5',
      provider_id: 'anthropic',
      max_tokens: 200000,
      cost_per_1k_input: 0.003, // $3.00/M input
      cost_per_1k_output: 0.015, // $15.00/M output
      supports_reasoning: true,
    },
    {
      model_id: 'us.amazon.nova-lite-v1:0',
      display_name: 'Amazon Nova Lite',
      provider_id: 'bedrock',
      max_tokens: 300000,
      cost_per_1k_input: 0.00006,
      cost_per_1k_output: 0.00024,
      supports_reasoning: false,
    },
    {
      model_id: 'us.amazon.nova-pro-v1:0',
      display_name: 'Amazon Nova Pro',
      provider_id: 'bedrock',
      max_tokens: 300000,
      cost_per_1k_input: 0.0008,
      cost_per_1k_output: 0.0032,
      supports_reasoning: true,
    },
  ];

  for (const model of models) {
    const apiModelId = model.api_model_id ? `'${model.api_model_id}'` : 'NULL';
    pgm.sql(
      `INSERT INTO app.model_config
       (model_id, api_model_id, display_name, provider_id, is_enabled, max_tokens, cost_per_1k_input, cost_per_1k_output, supports_reasoning)
       VALUES
       ('${model.model_id}', ${apiModelId}, '${model.display_name}', '${model.provider_id}', true, ${model.max_tokens}, ${model.cost_per_1k_input}, ${model.cost_per_1k_output}, ${model.supports_reasoning})
       ON CONFLICT (model_id) DO UPDATE
       SET api_model_id = EXCLUDED.api_model_id,
           display_name = EXCLUDED.display_name,
           provider_id = EXCLUDED.provider_id,
           max_tokens = EXCLUDED.max_tokens,
           cost_per_1k_input = EXCLUDED.cost_per_1k_input,
           cost_per_1k_output = EXCLUDED.cost_per_1k_output,
           supports_reasoning = EXCLUDED.supports_reasoning,
           updated_at = now()`
    );
  }
}

function seedDefaultCategoryConfigs(pgm) {
  pgm.sql(
    `INSERT INTO app.model_category_config (category, model_id, player_id)
     VALUES ('prose', 'claude-sonnet-4.5', NULL), ('classification', 'claude-haiku-4.5', NULL)
     ON CONFLICT (category, player_id) DO NOTHING`
  );
}
