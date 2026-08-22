-- Production bootstrap prerequisite: install pgvector's "vector" extension in
-- this database as the RDS administrator before running project migrations.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE entity
  ADD COLUMN IF NOT EXISTS embedding vector(256),
  ADD COLUMN IF NOT EXISTS embedding_model text,
  ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS entity_embedding_cosine_idx
  ON entity USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
