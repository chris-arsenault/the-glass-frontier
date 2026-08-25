-- The Ahara-provisioned reader role only receives grants on the public
-- schema, so the LLM audit tables in ops are invisible to read-only
-- diagnostics. Extend the reader to ops, including future tables.
--
-- The role exists only in RDS environments (provisioned by Ahara), so the
-- grants are skipped where it is absent — local development and CI databases.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'glass-frontier_reader') THEN
    GRANT USAGE ON SCHEMA ops TO "glass-frontier_reader";
    GRANT SELECT ON ALL TABLES IN SCHEMA ops TO "glass-frontier_reader";
    ALTER DEFAULT PRIVILEGES IN SCHEMA ops
      GRANT SELECT ON TABLES TO "glass-frontier_reader";
  END IF;
END
$$;
