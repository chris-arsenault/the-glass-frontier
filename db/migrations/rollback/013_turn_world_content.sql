-- Restores the pre-world search column alongside dropping world_content.
DROP INDEX IF EXISTS chronicle_turn_search_idx;
ALTER TABLE chronicle_turn DROP COLUMN IF EXISTS search;
ALTER TABLE chronicle_turn
  DROP COLUMN IF EXISTS world_fronts,
  DROP COLUMN IF EXISTS world_content;
ALTER TABLE chronicle_turn
  ADD COLUMN search tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(gm_summary, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(player_message_content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(gm_response_content, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS chronicle_turn_search_idx
  ON chronicle_turn USING gin (search);
