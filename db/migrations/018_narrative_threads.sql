-- Retire the relational surfaces of the former beat, front, and scene-ledger
-- trackers. Chronicle JSON is intentionally untouched: current readers use
-- canonical defaults and ignore old unknown keys.
ALTER TABLE chronicle
  DROP COLUMN IF EXISTS beats_enabled;

ALTER TABLE lore_fragment
  DROP COLUMN IF EXISTS beat_id;

ALTER TABLE chronicle_turn
  DROP COLUMN IF EXISTS beat_tracker,
  DROP COLUMN IF EXISTS scene_context,
  DROP COLUMN IF EXISTS world_fronts;

DELETE FROM app.prompt_template
WHERE id IN ('beat-reconciler', 'turn-judge');
