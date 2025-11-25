/* eslint-disable no-undef */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF to_regclass('app.player') IS NULL THEN
        IF to_regclass('public.player') IS NOT NULL THEN
          ALTER TABLE public.player SET SCHEMA app;
        ELSE
          CREATE TABLE app.player (
            id text PRIMARY KEY,
            username text NOT NULL,
            email text,
            preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
            template_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
            metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
            updated_at timestamptz NOT NULL DEFAULT now()
          );
        END IF;
      END IF;
    END$$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF to_regclass('app.player') IS NOT NULL AND to_regclass('public.player') IS NULL THEN
        ALTER TABLE app.player SET SCHEMA public;
      END IF;
    END$$;
  `);
};
