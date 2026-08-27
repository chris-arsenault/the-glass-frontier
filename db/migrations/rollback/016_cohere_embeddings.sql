-- Returns the column to Titan's 256 dimensions. The Cohere vectors are dropped
-- rather than converted, and the canon-seed backfill must run again to refill
-- the column under whichever model the code is on.
DROP INDEX IF EXISTS entity_embedding_cosine_idx;

ALTER TABLE entity DROP COLUMN IF EXISTS embedding;
ALTER TABLE entity ADD COLUMN embedding vector(256);

UPDATE entity
  SET embedding_model = NULL, embedding_updated_at = NULL
  WHERE embedding_model IS NOT NULL;

CREATE INDEX IF NOT EXISTS entity_embedding_cosine_idx
  ON entity USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
