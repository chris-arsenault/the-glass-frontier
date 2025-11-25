/* eslint-disable no-undef */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF to_regclass('app.player') IS NULL THEN
        RAISE EXCEPTION 'Missing app.player table. Run @glass-frontier/app migrations first.';
      END IF;
    END$$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(
    "DO $$ BEGIN IF to_regclass('app.player') IS NOT NULL THEN RAISE NOTICE 'app.player is managed by the app schema.'; END IF; END$$;"
  );
};
