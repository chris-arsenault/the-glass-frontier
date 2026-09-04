ALTER TABLE chronicle_turn
  ADD COLUMN IF NOT EXISTS scene_context jsonb;
