ALTER TABLE character
  DROP CONSTRAINT IF EXISTS character_allegiance_stance_check;

ALTER TABLE character
  DROP COLUMN IF EXISTS species_id,
  DROP COLUMN IF EXISTS culture_id,
  DROP COLUMN IF EXISTS homeland_id,
  DROP COLUMN IF EXISTS allegiance_id,
  DROP COLUMN IF EXISTS allegiance_stance,
  DROP COLUMN IF EXISTS callings,
  DROP COLUMN IF EXISTS drive,
  DROP COLUMN IF EXISTS flaw,
  DROP COLUMN IF EXISTS instinct,
  DROP COLUMN IF EXISTS unique_thing;
