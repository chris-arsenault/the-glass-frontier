ALTER TABLE chronicle_turn
  DROP COLUMN IF EXISTS entity_references;

UPDATE chronicle
SET props = props - 'entityRoster';

-- Prompt bodies are not rolled back here: they come from the generated seed,
-- so reverting them means reverting packages/app/templates and regenerating.

ALTER TABLE chronicle_turn
  RENAME COLUMN entity_roster TO entity_offered;
