DROP INDEX IF EXISTS entity_embedding_cosine_idx;

ALTER TABLE entity
  DROP COLUMN IF EXISTS embedding_updated_at,
  DROP COLUMN IF EXISTS embedding_model,
  DROP COLUMN IF EXISTS embedding;
