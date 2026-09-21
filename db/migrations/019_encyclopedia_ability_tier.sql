-- Lorecraft now classifies an ability with one tier rather than a list of
-- tier-specific effects. The authoritative canon seed supplies the new values.
-- Keep the old column's data intact; current readers and writers use only tier.
ALTER TABLE encyclopedia_entry
  ADD COLUMN tier text CHECK (tier IN ('broad', 'focused', 'narrow'));
