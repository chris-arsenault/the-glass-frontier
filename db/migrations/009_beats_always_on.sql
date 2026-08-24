-- Beats are no longer optional. Every chronicle tracks its goals as beats,
-- starting from a founding beat created from the seed, so the per-chronicle
-- toggle has no meaning.
ALTER TABLE chronicle
  DROP COLUMN IF EXISTS beats_enabled;
