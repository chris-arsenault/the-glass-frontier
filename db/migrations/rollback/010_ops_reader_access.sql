DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'glass-frontier_reader') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA ops
      REVOKE SELECT ON TABLES FROM "glass-frontier_reader";
    REVOKE SELECT ON ALL TABLES IN SCHEMA ops FROM "glass-frontier_reader";
    REVOKE USAGE ON SCHEMA ops FROM "glass-frontier_reader";
  END IF;
END
$$;
