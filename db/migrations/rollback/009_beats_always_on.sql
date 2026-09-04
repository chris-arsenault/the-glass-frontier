ALTER TABLE chronicle
  ADD COLUMN IF NOT EXISTS beats_enabled boolean NOT NULL DEFAULT true;
