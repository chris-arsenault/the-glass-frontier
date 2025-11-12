-- Migration: Persist moderation queue and publishing cadence state
-- Scope: IMP-MOD-03 follow-up to store queue/cadence snapshots in PostgreSQL

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS moderation_queue_state (
    session_id uuid PRIMARY KEY,
    state jsonb NOT NULL,
    pending_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_queue_pending_count
    ON moderation_queue_state (pending_count);

CREATE INDEX IF NOT EXISTS idx_moderation_queue_state_updated_at
    ON moderation_queue_state (updated_at DESC);

CREATE OR REPLACE FUNCTION moderation_queue_state_set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS moderation_queue_state_touch
    ON moderation_queue_state;

CREATE TRIGGER moderation_queue_state_touch
    BEFORE UPDATE ON moderation_queue_state
    FOR EACH ROW
    EXECUTE FUNCTION moderation_queue_state_set_updated_at();

CREATE TABLE IF NOT EXISTS publishing_cadence_state (
    session_id uuid PRIMARY KEY,
    state jsonb NOT NULL,
    history jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_publishing_cadence_state_updated_at
    ON publishing_cadence_state (updated_at DESC);

CREATE OR REPLACE FUNCTION publishing_cadence_state_set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS publishing_cadence_state_touch
    ON publishing_cadence_state;

CREATE TRIGGER publishing_cadence_state_touch
    BEFORE UPDATE ON publishing_cadence_state
    FOR EACH ROW
    EXECUTE FUNCTION publishing_cadence_state_set_updated_at();

COMMIT;
