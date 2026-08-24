ALTER DEFAULT PRIVILEGES IN SCHEMA ops
  REVOKE SELECT ON TABLES FROM "glass-frontier_reader";
REVOKE SELECT ON ALL TABLES IN SCHEMA ops FROM "glass-frontier_reader";
REVOKE USAGE ON SCHEMA ops FROM "glass-frontier_reader";
