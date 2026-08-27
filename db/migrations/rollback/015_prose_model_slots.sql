-- Drops the shadow slots and restores one model per category per player.
-- Slots 2 and 3 configured nothing the story kept, so discarding them loses
-- only which comparison models a player had chosen.
DELETE FROM app.model_category_config WHERE slot <> 1;

DROP INDEX IF EXISTS app.model_category_config_unique_idx;
ALTER TABLE app.model_category_config
  DROP CONSTRAINT IF EXISTS model_category_config_single_slot_categories;
ALTER TABLE app.model_category_config
  DROP CONSTRAINT IF EXISTS model_category_config_slot_range;
ALTER TABLE app.model_category_config DROP COLUMN IF EXISTS slot;

CREATE UNIQUE INDEX IF NOT EXISTS model_category_config_unique_idx
  ON app.model_category_config (category, player_id) NULLS NOT DISTINCT;
