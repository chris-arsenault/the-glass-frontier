-- Re-index canon under Cohere Embed v4 at 1024 dimensions.
--
-- Titan v2 embedded canon and queries into one symmetric space, which scores
-- how alike two sentences are. Retrieval wants something else: whether a canon
-- entry answers a question. Embed v4 is trained asymmetrically for exactly
-- that, and the search tool now embeds the player's words as a query and canon
-- as a document.
--
-- Vectors from the old model cannot be converted, only replaced: 256 Titan
-- dimensions and 1024 Cohere dimensions describe different spaces, and a
-- similarity between them is noise. Clearing the column is what makes the
-- canon-seed backfill pick every entity up again, and until it runs, semantic
-- search returns nothing rather than something wrong.
DROP INDEX IF EXISTS entity_embedding_cosine_idx;

ALTER TABLE entity DROP COLUMN IF EXISTS embedding;
ALTER TABLE entity ADD COLUMN embedding vector(1024);

-- The model tag is what a later migration would read to tell which generation
-- a row belongs to; leaving a Titan tag on an empty column would lie about it.
UPDATE entity
  SET embedding_model = NULL, embedding_updated_at = NULL
  WHERE embedding_model IS NOT NULL;

CREATE INDEX IF NOT EXISTS entity_embedding_cosine_idx
  ON entity USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
