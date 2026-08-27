-- Three prose models per player instead of one.
--
-- The primary model writes the turn the story keeps. The secondary and
-- tertiary, when set, write nothing canonical: each produces a retrieval
-- panel and a retrieval-free panel beside the turn, so a chronicle can be read
-- back as the same scene told by up to three models under both conditions.
--
-- The slot is the unit of configuration, and an absent row is the off switch:
-- a player who sets only the primary pays for one model's two generations.
-- Classification stays single-slot — every one of its calls is on the turn's
-- critical path, and a shadow classifier would decide nothing.
ALTER TABLE app.model_category_config
  ADD COLUMN IF NOT EXISTS slot smallint NOT NULL DEFAULT 1;

ALTER TABLE app.model_category_config
  DROP CONSTRAINT IF EXISTS model_category_config_slot_range;
ALTER TABLE app.model_category_config
  ADD CONSTRAINT model_category_config_slot_range CHECK (slot BETWEEN 1 AND 3);

-- Only prose has more than one slot; anything else would be a second opinion
-- nobody reads.
ALTER TABLE app.model_category_config
  DROP CONSTRAINT IF EXISTS model_category_config_single_slot_categories;
ALTER TABLE app.model_category_config
  ADD CONSTRAINT model_category_config_single_slot_categories
  CHECK (slot = 1 OR category = 'prose');

-- The old index made (category, player_id) unique, which is exactly what the
-- slots must not be. Existing rows keep slot 1 and stay the primary.
DROP INDEX IF EXISTS app.model_category_config_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS model_category_config_unique_idx
  ON app.model_category_config (category, player_id, slot) NULLS NOT DISTINCT;
