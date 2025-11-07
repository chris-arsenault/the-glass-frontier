CREATE TABLE IF NOT EXISTS session_summaries (
  session_id UUID PRIMARY KEY,
  version INT NOT NULL DEFAULT 1,
  scene_breakdown JSONB NOT NULL,
  act_summary JSONB NOT NULL,
  player_highlights JSONB NOT NULL,
  safety_notes JSONB NOT NULL,
  summary_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachments_url TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_summaries_generated_at
  ON session_summaries (generated_at DESC);

