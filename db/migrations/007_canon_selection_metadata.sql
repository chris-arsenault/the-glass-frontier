ALTER TABLE entity
  ADD COLUMN IF NOT EXISTS is_article boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS playable_as text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS origin_blurb text,
  ADD COLUMN IF NOT EXISTS veiled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS veil_tagline text,
  ADD COLUMN IF NOT EXISTS dm boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS entity_playable_as_idx
  ON entity USING gin (playable_as);
