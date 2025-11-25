/* eslint-disable no-undef, @typescript-eslint/no-require-imports */

exports.shorthands = undefined;

exports.up = async (pgm) => {
  // Add nova-micro model if it doesn't exist
  pgm.sql(
    `INSERT INTO app.model_config
     (model_id, display_name, provider_id, is_enabled, max_tokens, cost_per_1k_input, cost_per_1k_output, supports_reasoning)
     VALUES
     ('us.amazon.nova-micro-v1:0', 'Amazon Nova Micro', 'bedrock', true, 128000, 0.000035, 0.00014, false)
     ON CONFLICT (model_id) DO NOTHING`
  );

  // Update default category configs:
  // - prose: claude-haiku-4.5 (was claude-sonnet-4.5)
  // - classification: us.amazon.nova-micro-v1:0 (was claude-haiku-4.5)
  pgm.sql(
    `UPDATE app.model_category_config
     SET model_id = 'claude-haiku-4.5', updated_at = now()
     WHERE category = 'prose' AND player_id IS NULL`
  );

  pgm.sql(
    `UPDATE app.model_category_config
     SET model_id = 'us.amazon.nova-micro-v1:0', updated_at = now()
     WHERE category = 'classification' AND player_id IS NULL`
  );
};

exports.down = (pgm) => {
  // Revert to previous defaults
  pgm.sql(
    `UPDATE app.model_category_config
     SET model_id = 'claude-sonnet-4.5', updated_at = now()
     WHERE category = 'prose' AND player_id IS NULL`
  );

  pgm.sql(
    `UPDATE app.model_category_config
     SET model_id = 'claude-haiku-4.5', updated_at = now()
     WHERE category = 'classification' AND player_id IS NULL`
  );
};
