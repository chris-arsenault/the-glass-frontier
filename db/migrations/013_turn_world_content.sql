-- What the world did on a turn, whether or not the narration showed it.
--
-- The environment stage runs before the check and records what everything that
-- is not the player was doing. Keeping it beside the player message and the
-- narration gives the world a continuous life in the transcript: a front that
-- stirred quietly on turn 3 is still there to be found on turn 9.
ALTER TABLE chronicle_turn
  ADD COLUMN IF NOT EXISTS world_content text,
  -- The state of the world's agendas as this turn left them, so a chronicle's
  -- history shows what was building and when, not only the current clocks.
  ADD COLUMN IF NOT EXISTS world_fronts jsonb;

-- The search column is GENERATED ALWAYS, so it cannot be extended in place.
-- World text carries the same weight as the player's message: both are things
-- that happened, as opposed to the summary (A) the reader ranks highest.
DROP INDEX IF EXISTS chronicle_turn_search_idx;
ALTER TABLE chronicle_turn DROP COLUMN IF EXISTS search;
ALTER TABLE chronicle_turn
  ADD COLUMN search tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(gm_summary, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(player_message_content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(world_content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(gm_response_content, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS chronicle_turn_search_idx
  ON chronicle_turn USING gin (search);
