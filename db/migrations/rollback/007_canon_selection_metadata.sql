DROP INDEX IF EXISTS entity_playable_as_idx;

ALTER TABLE entity
  DROP COLUMN IF EXISTS dm,
  DROP COLUMN IF EXISTS veil_tagline,
  DROP COLUMN IF EXISTS veiled,
  DROP COLUMN IF EXISTS origin_blurb,
  DROP COLUMN IF EXISTS playable_as,
  DROP COLUMN IF EXISTS is_article;
