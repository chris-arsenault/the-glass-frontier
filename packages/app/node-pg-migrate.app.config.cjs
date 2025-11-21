/* eslint-env node */
/* eslint-disable no-undef */
const DEFAULT_CONNECTION_STRING = 'postgres://postgres:postgres@localhost:5432/worldstate';

module.exports = {
  dir: 'migrations',
  'migrations-table': 'app_migrations',
  databaseUrl:
    process.env.GLASS_FRONTIER_DATABASE_URL ??
    process.env.DATABASE_URL ??
    DEFAULT_CONNECTION_STRING,
};
