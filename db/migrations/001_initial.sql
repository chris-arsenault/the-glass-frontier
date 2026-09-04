CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE app.player (
  id text PRIMARY KEY,
  username text NOT NULL,
  email text,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.prompt_template (
  id text PRIMARY KEY,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.prompt_template_override (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id text NOT NULL REFERENCES app.prompt_template(id) ON DELETE CASCADE,
  player_id text NOT NULL REFERENCES app.player(id) ON DELETE CASCADE,
  variant_id text NOT NULL,
  label text NOT NULL,
  body text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX prompt_template_override_variant_idx
  ON app.prompt_template_override (template_id, player_id, variant_id);
CREATE UNIQUE INDEX prompt_template_override_active_idx
  ON app.prompt_template_override (template_id, player_id)
  WHERE is_active = true;

CREATE TABLE app.model_config (
  model_id text PRIMARY KEY,
  api_model_id text NOT NULL UNIQUE,
  display_name text NOT NULL,
  provider_id text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  context_window integer NOT NULL,
  max_output_tokens integer NOT NULL,
  cost_per_1k_input numeric(10, 6) NOT NULL,
  cost_per_1k_output numeric(10, 6) NOT NULL,
  reasoning_efforts text[] NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.model_category_config (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  category text NOT NULL,
  model_id text NOT NULL REFERENCES app.model_config(model_id) ON DELETE CASCADE,
  player_id text REFERENCES app.player(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX model_category_config_unique_idx
  ON app.model_category_config (category, player_id) NULLS NOT DISTINCT;

CREATE TABLE world_prominence (
  id text PRIMARY KEY,
  rank integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE world_kind (
  id text PRIMARY KEY,
  category text,
  display_name text,
  default_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE world_subkind (
  id text NOT NULL,
  kind_id text NOT NULL REFERENCES world_kind(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT world_subkind_pk PRIMARY KEY (id, kind_id)
);

CREATE TABLE world_kind_status (
  kind_id text NOT NULL REFERENCES world_kind(id) ON DELETE CASCADE,
  status text NOT NULL,
  CONSTRAINT world_kind_status_pk PRIMARY KEY (kind_id, status)
);

CREATE TABLE world_relationship_kind (
  id text PRIMARY KEY,
  description text,
  category text NOT NULL DEFAULT 'causal',
  default_strength real NOT NULL DEFAULT 0.5,
  CONSTRAINT world_relationship_kind_strength_range
    CHECK (default_strength >= 0.0 AND default_strength <= 1.0)
);

CREATE INDEX world_relationship_kind_category_idx ON world_relationship_kind (category);

CREATE TABLE world_relationship_rule (
  relationship_id text NOT NULL REFERENCES world_relationship_kind(id) ON DELETE CASCADE,
  src_kind text NOT NULL REFERENCES world_kind(id) ON DELETE CASCADE,
  dst_kind text NOT NULL REFERENCES world_kind(id) ON DELETE CASCADE,
  CONSTRAINT world_relationship_rule_pk PRIMARY KEY (relationship_id, src_kind, dst_kind)
);

CREATE TABLE node (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE character (
  id uuid PRIMARY KEY REFERENCES node(id) ON DELETE CASCADE,
  player_id text NOT NULL REFERENCES app.player(id) ON DELETE CASCADE,
  name text NOT NULL,
  archetype text NOT NULL DEFAULT 'unknown',
  pronouns text NOT NULL DEFAULT 'unspecified',
  bio text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  skills jsonb NOT NULL DEFAULT '{}'::jsonb,
  inventory jsonb NOT NULL DEFAULT '[]'::jsonb,
  momentum jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX character_player_idx ON character (player_id);

CREATE TABLE entity (
  id uuid PRIMARY KEY REFERENCES node(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  kind text NOT NULL REFERENCES world_kind(id) ON DELETE RESTRICT,
  subkind text,
  name text NOT NULL,
  description text,
  prominence text NOT NULL DEFAULT 'recognized' REFERENCES world_prominence(id) ON DELETE RESTRICT,
  status text,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_location boolean NOT NULL DEFAULT false,
  batch_id uuid,
  external_key text,
  source text NOT NULL DEFAULT 'seed',
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entity_subkind_fk
    FOREIGN KEY (subkind, kind) REFERENCES world_subkind(id, kind_id) ON DELETE RESTRICT,
  CONSTRAINT entity_prominence_check
    CHECK (prominence IN ('forgotten', 'marginal', 'recognized', 'renowned', 'mythic')),
  CONSTRAINT entity_source_check CHECK (source IN ('import', 'seed', 'play', 'author'))
);

CREATE INDEX entity_kind_idx ON entity (kind);
CREATE INDEX entity_kind_prominence_idx ON entity (kind, prominence);
CREATE UNIQUE INDEX entity_source_external_key_idx
  ON entity (source, external_key) WHERE external_key IS NOT NULL;
CREATE INDEX entity_batch_idx ON entity (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX entity_is_location_idx ON entity (is_location) WHERE is_location = true;

CREATE TABLE edge (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  src_id uuid NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  dst_id uuid NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  type text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  strength real,
  batch_id uuid,
  source text NOT NULL DEFAULT 'seed',
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT edge_strength_range CHECK (strength IS NULL OR (strength >= 0.0 AND strength <= 1.0)),
  CONSTRAINT edge_source_check CHECK (source IN ('import', 'seed', 'play', 'author'))
);

CREATE INDEX edge_src_type_idx ON edge (src_id, type);
CREATE INDEX edge_dst_type_idx ON edge (dst_id, type);
CREATE UNIQUE INDEX edge_src_dst_type_idx ON edge (src_id, dst_id, type);
CREATE UNIQUE INDEX edge_character_resides_once ON edge (src_id) WHERE type = 'resides_in';
CREATE INDEX edge_strength_idx ON edge (strength) WHERE strength IS NOT NULL;
CREATE INDEX edge_batch_idx ON edge (batch_id) WHERE batch_id IS NOT NULL;

CREATE TABLE chronicle (
  id uuid PRIMARY KEY REFERENCES node(id) ON DELETE CASCADE,
  title text NOT NULL,
  primary_char_id uuid REFERENCES character(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  player_id text NOT NULL REFERENCES app.player(id) ON DELETE CASCADE,
  location_name text NOT NULL,
  location_id uuid REFERENCES entity(id) ON DELETE SET NULL,
  anchor_entity_id uuid REFERENCES entity(id) ON DELETE SET NULL,
  seed_text text,
  entity_focus jsonb NOT NULL DEFAULT '{"entityScores":{},"tagScores":{}}'::jsonb,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chronicle_player_idx ON chronicle (player_id);
CREATE INDEX chronicle_location_idx ON chronicle (location_id);
CREATE INDEX chronicle_anchor_entity_idx ON chronicle (anchor_entity_id);

CREATE TABLE lore_fragment (
  id uuid PRIMARY KEY REFERENCES node(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  chronicle_id uuid REFERENCES chronicle(id) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  prose text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  batch_id uuid,
  external_key text,
  source text NOT NULL DEFAULT 'seed',
  source_id text,
  search tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(prose, '')), 'B')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lore_fragment_source_check CHECK (source IN ('import', 'seed', 'play', 'author'))
);

CREATE INDEX lore_fragment_entity_idx ON lore_fragment (entity_id, created_at);
CREATE INDEX lore_fragment_chronicle_idx ON lore_fragment (chronicle_id);
CREATE INDEX lore_fragment_tags_idx ON lore_fragment USING gin (tags);
CREATE INDEX lore_fragment_search_idx ON lore_fragment USING gin (search);
CREATE UNIQUE INDEX lore_fragment_source_external_key_idx
  ON lore_fragment (source, external_key) WHERE external_key IS NOT NULL;
CREATE INDEX lore_fragment_batch_idx ON lore_fragment (batch_id) WHERE batch_id IS NOT NULL;

CREATE TABLE chronicle_turn (
  id uuid PRIMARY KEY REFERENCES node(id) ON DELETE CASCADE,
  chronicle_id uuid NOT NULL REFERENCES chronicle(id) ON DELETE CASCADE,
  turn_sequence integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_nodes text[] DEFAULT '{}'::text[],
  failure boolean NOT NULL DEFAULT false,
  advances_timeline boolean NOT NULL DEFAULT false,
  player_message_id text NOT NULL,
  player_message_content text NOT NULL,
  player_message_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  player_intent jsonb,
  gm_response_id text,
  gm_response_content text,
  gm_response_metadata jsonb DEFAULT '{}'::jsonb,
  gm_summary text,
  system_message_id text,
  system_message_content text,
  system_message_metadata jsonb DEFAULT '{}'::jsonb,
  skill_check_plan jsonb,
  skill_check_result jsonb,
  inventory_delta jsonb,
  location_delta jsonb,
  gm_trace jsonb,
  entity_offered jsonb,
  entity_usage jsonb
);

CREATE UNIQUE INDEX chronicle_turn_chronicle_idx
  ON chronicle_turn (chronicle_id, turn_sequence);
CREATE INDEX chronicle_turn_failure_idx ON chronicle_turn (chronicle_id) WHERE failure = true;
CREATE INDEX chronicle_turn_skill_check_idx
  ON chronicle_turn (chronicle_id) WHERE skill_check_result IS NOT NULL;
CREATE INDEX chronicle_turn_created_idx ON chronicle_turn (created_at);

CREATE TABLE chronicle_session_state (
  chronicle_id uuid PRIMARY KEY REFERENCES chronicle(id) ON DELETE CASCADE,
  character_state jsonb,
  last_turn_sequence integer NOT NULL DEFAULT -1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ingest_batch (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source text NOT NULL,
  source_id text,
  entity_count integer NOT NULL DEFAULT 0,
  relationship_count integer NOT NULL DEFAULT 0,
  lore_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingest_batch_source_check CHECK (source IN ('import', 'seed', 'play', 'author'))
);

CREATE INDEX ingest_batch_created_idx ON ingest_batch (created_at);

CREATE TABLE ops.token_usage (
  player_id text NOT NULL,
  usage_period text NOT NULL,
  total_requests integer NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT token_usage_pk PRIMARY KEY (player_id, usage_period)
);

CREATE INDEX token_usage_player_idx ON ops.token_usage (player_id);

CREATE TABLE ops.bug_report (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id text NOT NULL,
  summary text NOT NULL,
  details text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  chronicle_id uuid,
  character_id uuid,
  admin_notes text,
  backlog_item text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bug_report_player_idx ON ops.bug_report (player_id);
CREATE INDEX bug_report_created_idx ON ops.bug_report (created_at);

CREATE TABLE ops.audit_group (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  scope_type text NOT NULL,
  scope_ref text,
  player_id text NOT NULL,
  chronicle_id uuid,
  character_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX audit_group_scope_unique
  ON ops.audit_group (scope_type, scope_ref, player_id) NULLS NOT DISTINCT;
CREATE INDEX audit_group_scope_idx ON ops.audit_group (scope_type, scope_ref);
CREATE INDEX audit_group_player_idx ON ops.audit_group (player_id);
CREATE INDEX audit_group_chronicle_idx ON ops.audit_group (chronicle_id);

CREATE TABLE ops.audit_entry (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES ops.audit_group(id) ON DELETE CASCADE,
  player_id text NOT NULL,
  chronicle_id uuid,
  character_id uuid,
  turn_id uuid,
  provider_id text NOT NULL,
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_entry_group_idx ON ops.audit_entry (group_id);
CREATE INDEX audit_entry_created_idx ON ops.audit_entry (created_at, id);
CREATE INDEX audit_entry_player_idx ON ops.audit_entry (player_id);
CREATE INDEX audit_entry_turn_idx ON ops.audit_entry (turn_id);
CREATE INDEX audit_entry_chronicle_idx ON ops.audit_entry (chronicle_id);
CREATE INDEX audit_entry_duration_idx ON ops.audit_entry (duration_ms);

CREATE TABLE ops.audit_review (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES ops.audit_group(id) ON DELETE CASCADE,
  audit_id uuid NOT NULL REFERENCES ops.audit_entry(id) ON DELETE CASCADE,
  reviewer_id text NOT NULL,
  status text NOT NULL,
  severity text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_review_group_idx ON ops.audit_review (group_id);
CREATE INDEX audit_review_audit_idx ON ops.audit_review (audit_id);
CREATE INDEX audit_review_reviewer_idx ON ops.audit_review (reviewer_id, created_at);

CREATE TABLE ops.audit_feedback (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES ops.audit_group(id) ON DELETE CASCADE,
  audit_id uuid REFERENCES ops.audit_entry(id) ON DELETE CASCADE,
  player_id text NOT NULL,
  sentiment text NOT NULL,
  note text,
  comment text,
  chronicle_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  turn_sequence integer NOT NULL DEFAULT 0,
  gm_entry_id text NOT NULL,
  expected_intent_type text,
  expected_inventory_delta boolean,
  expected_inventory_notes text,
  expected_location_change boolean,
  expected_location_notes text,
  expected_skill_check boolean,
  expected_skill_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_feedback_group_idx ON ops.audit_feedback (group_id);
CREATE INDEX audit_feedback_player_idx ON ops.audit_feedback (player_id, created_at);

CREATE TABLE ops.model_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id text NOT NULL,
  model_id text NOT NULL,
  provider_id text NOT NULL,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  request_count bigint NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX model_usage_player_model_date_idx
  ON ops.model_usage (player_id, model_id, date);
CREATE INDEX model_usage_date_idx ON ops.model_usage (date);
