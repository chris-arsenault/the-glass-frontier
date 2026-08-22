/* eslint-disable no-undef */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    UPDATE app.model_config
    SET api_model_id = 'us.anthropic.claude-sonnet-5',
        provider_id = 'bedrock',
        cost_per_1k_input = 0.003,
        cost_per_1k_output = 0.015,
        updated_at = now()
    WHERE model_id = 'claude-sonnet-5';

    INSERT INTO app.model_config
      (model_id, api_model_id, display_name, provider_id, is_enabled,
       context_window, max_output_tokens, cost_per_1k_input, cost_per_1k_output,
       reasoning_efforts)
    VALUES
      ('amazon-nova-pro', 'us.amazon.nova-pro-v1:0', 'Amazon Nova Pro', 'bedrock', true,
       300000, 5000, 0.0008, 0.0032, ARRAY['low'])
    ON CONFLICT (model_id) DO UPDATE SET
      api_model_id = EXCLUDED.api_model_id,
      display_name = EXCLUDED.display_name,
      provider_id = EXCLUDED.provider_id,
      is_enabled = EXCLUDED.is_enabled,
      context_window = EXCLUDED.context_window,
      max_output_tokens = EXCLUDED.max_output_tokens,
      cost_per_1k_input = EXCLUDED.cost_per_1k_input,
      cost_per_1k_output = EXCLUDED.cost_per_1k_output,
      reasoning_efforts = EXCLUDED.reasoning_efforts,
      updated_at = now();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM app.model_config WHERE model_id = 'amazon-nova-pro';

    UPDATE app.model_config
    SET api_model_id = 'claude-sonnet-5',
        provider_id = 'anthropic',
        cost_per_1k_input = 0.002,
        cost_per_1k_output = 0.01,
        updated_at = now()
    WHERE model_id = 'claude-sonnet-5';
  `);
};
