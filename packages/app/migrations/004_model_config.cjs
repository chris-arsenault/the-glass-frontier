/* eslint-disable @typescript-eslint/no-require-imports, no-undef */

const modelCatalog = require('../src/modelCatalog.json');

exports.shorthands = undefined;

exports.up = async (pgm) => {
  pgm.createTable(
    { schema: 'app', name: 'model_config' },
    {
      model_id: { type: 'text', primaryKey: true },
      api_model_id: { type: 'text', notNull: true, unique: true },
      display_name: { type: 'text', notNull: true },
      provider_id: { type: 'text', notNull: true },
      is_enabled: { type: 'boolean', notNull: true, default: true },
      context_window: { type: 'integer', notNull: true },
      max_output_tokens: { type: 'integer', notNull: true },
      cost_per_1k_input: { type: 'numeric(10,6)', notNull: true },
      cost_per_1k_output: { type: 'numeric(10,6)', notNull: true },
      reasoning_efforts: { type: 'text[]', notNull: true },
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
  for (const model of modelCatalog.models) {
    const reasoningEfforts = model.reasoningEfforts.map((effort) => `'${effort}'`).join(', ');
    pgm.sql(
      `INSERT INTO app.model_config
       (model_id, api_model_id, display_name, provider_id, is_enabled, context_window, max_output_tokens, cost_per_1k_input, cost_per_1k_output, reasoning_efforts)
       VALUES
       ('${model.modelId}', '${model.apiModelId}', '${model.displayName}', '${model.providerId}', true, ${model.contextWindow}, ${model.maxOutputTokens}, ${model.costPer1kInput}, ${model.costPer1kOutput}, ARRAY[${reasoningEfforts}])`
    );
  }
}

function seedDefaultCategoryConfigs(pgm) {
  for (const [category, modelId] of Object.entries(modelCatalog.defaults)) {
    pgm.sql(
      `INSERT INTO app.model_category_config (category, model_id, player_id)
       VALUES ('${category}', '${modelId}', NULL)`
    );
  }
}
