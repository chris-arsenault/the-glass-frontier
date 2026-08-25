-- Full-text search over chronicle turn prose, scoped per chronicle by the
-- reader. Powers the GM prose agent's history retrieval.
ALTER TABLE chronicle_turn
  ADD COLUMN IF NOT EXISTS search tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(gm_summary, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(player_message_content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(gm_response_content, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS chronicle_turn_search_idx
  ON chronicle_turn USING gin (search);
