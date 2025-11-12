-- Migration: Create hub verb catalog persistence tables
-- Applies schema for IMP-HUB-04 (verb catalog persistence & admin controls)

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS hub_verbs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hub_id text NULL,
    verb_id text NOT NULL,
    version integer NOT NULL,
    definition jsonb NOT NULL,
    capability_tags text[] NULL,
    safety_tags text[] NULL,
    moderation_tags text[] NULL,
    status text NOT NULL DEFAULT 'draft',
    audit_ref text NULL,
    created_by text NULL,
    updated_by text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hub_verbs_status_check CHECK (status IN ('active', 'draft', 'deprecated')),
    CONSTRAINT hub_verbs_unique_version UNIQUE (hub_id, verb_id, version)
);

CREATE INDEX IF NOT EXISTS hub_verbs_lookup_idx
    ON hub_verbs (hub_id, verb_id, status);

CREATE TABLE IF NOT EXISTS hub_verb_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hub_id text NOT NULL,
    verb_id text NOT NULL,
    version integer NOT NULL,
    action text NOT NULL,
    payload jsonb NOT NULL,
    performed_by text NULL,
    audit_ref text NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION hub_verbs_set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    IF NEW.updated_by IS NULL THEN
        NEW.updated_by = OLD.updated_by;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION hub_verbs_audit_trigger()
RETURNS trigger AS $$
BEGIN
    INSERT INTO hub_verb_audit (
        id,
        hub_id,
        verb_id,
        version,
        action,
        payload,
        performed_by,
        audit_ref,
        created_at
    ) VALUES (
        gen_random_uuid(),
        COALESCE(NEW.hub_id, 'GLOBAL'),
        NEW.verb_id,
        NEW.version,
        TG_OP::text,
        to_jsonb(NEW),
        COALESCE(NEW.updated_by, NEW.created_by),
        COALESCE(NEW.audit_ref, OLD.audit_ref),
        now()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hub_verbs_set_updated_at_trigger ON hub_verbs;
CREATE TRIGGER hub_verbs_set_updated_at_trigger
    BEFORE UPDATE ON hub_verbs
    FOR EACH ROW EXECUTE FUNCTION hub_verbs_set_updated_at();

DROP TRIGGER IF EXISTS hub_verbs_audit_entry ON hub_verbs;
CREATE TRIGGER hub_verbs_audit_entry
    AFTER INSERT OR UPDATE ON hub_verbs
    FOR EACH ROW EXECUTE FUNCTION hub_verbs_audit_trigger();

COMMIT;
