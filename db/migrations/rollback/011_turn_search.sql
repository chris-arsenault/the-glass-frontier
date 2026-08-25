DROP INDEX IF EXISTS chronicle_turn_search_idx;

ALTER TABLE chronicle_turn
  DROP COLUMN IF EXISTS search;
