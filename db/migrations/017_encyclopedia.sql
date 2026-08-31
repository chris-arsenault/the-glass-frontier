-- Reusable world material lives beside the Atlas, never inside its node graph.
-- The production cutover resets the database, so this migration establishes
-- the final shape directly rather than carrying legacy origin columns forward.

ALTER TABLE ingest_batch
  ADD COLUMN encyclopedia_count integer NOT NULL DEFAULT 0,
  ADD COLUMN classification_count integer NOT NULL DEFAULT 0;

ALTER TABLE entity
  ADD COLUMN context_tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX entity_context_tags_idx ON entity USING gin (context_tags);

CREATE TABLE reference_context_tag (
  id text PRIMARY KEY,
  description text,
  scopes text[] NOT NULL,
  parent text,
  compatible_with text[] NOT NULL DEFAULT '{}'::text[],
  batch_id uuid NOT NULL REFERENCES ingest_batch(id) ON DELETE RESTRICT,
  source_revision text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE encyclopedia_entry (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_key text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}'::text[],
  kind text NOT NULL,
  subkind text NOT NULL,
  status text NOT NULL,
  dm boolean NOT NULL DEFAULT false,
  summary text,
  topics text[] NOT NULL DEFAULT '{}'::text[],
  availability jsonb,
  prevalence text,
  character_role text,
  origin_blurb text,
  facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  descriptive_identity jsonb NOT NULL DEFAULT '{}'::jsonb,
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  usage jsonb NOT NULL DEFAULT '{"cues":[],"affordances":[],"pressures":[],"variations":[]}'::jsonb,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  search tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', title), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B')
  ) STORED,
  embedding vector(1024),
  embedding_model text,
  embedding_updated_at timestamptz,
  batch_id uuid NOT NULL REFERENCES ingest_batch(id) ON DELETE RESTRICT,
  source_revision text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT encyclopedia_entry_status_check
    CHECK (status IN ('shell', 'draft', 'complete')),
  CONSTRAINT encyclopedia_entry_prevalence_check
    CHECK (prevalence IS NULL OR prevalence IN ('common', 'uncommon', 'rare')),
  CONSTRAINT encyclopedia_entry_character_role_check
    CHECK (character_role IS NULL OR character_role IN ('species', 'culture'))
);

CREATE INDEX encyclopedia_entry_kind_idx ON encyclopedia_entry (kind, subkind);
CREATE INDEX encyclopedia_entry_topics_idx ON encyclopedia_entry USING gin (topics);
CREATE INDEX encyclopedia_entry_aliases_idx ON encyclopedia_entry USING gin (aliases);
CREATE INDEX encyclopedia_entry_search_idx ON encyclopedia_entry USING gin (search);
CREATE INDEX encyclopedia_entry_character_role_idx
  ON encyclopedia_entry (character_role) WHERE character_role IS NOT NULL;
CREATE INDEX encyclopedia_entry_embedding_cosine_idx
  ON encyclopedia_entry USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE TABLE atlas_encyclopedia_classification (
  entity_id uuid NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  encyclopedia_entry_id uuid NOT NULL REFERENCES encyclopedia_entry(id) ON DELETE CASCADE,
  role text NOT NULL,
  batch_id uuid NOT NULL REFERENCES ingest_batch(id) ON DELETE RESTRICT,
  source_revision text NOT NULL,
  CONSTRAINT atlas_encyclopedia_classification_pk
    PRIMARY KEY (entity_id, encyclopedia_entry_id, role),
  CONSTRAINT atlas_encyclopedia_classification_role_check
    CHECK (role IN ('type', 'membership'))
);

CREATE UNIQUE INDEX atlas_encyclopedia_primary_type_idx
  ON atlas_encyclopedia_classification (entity_id) WHERE role = 'type';
CREATE INDEX atlas_encyclopedia_classification_entry_idx
  ON atlas_encyclopedia_classification (encyclopedia_entry_id, role);

ALTER TABLE character
  DROP COLUMN IF EXISTS species_id,
  DROP COLUMN IF EXISTS culture_id,
  ADD COLUMN species_reference_id uuid,
  ADD COLUMN culture_reference_id uuid;

ALTER TABLE chronicle_turn
  ADD COLUMN player_reference_slugs text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN reference_usage jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN reference_mentions jsonb NOT NULL DEFAULT '[]'::jsonb;
