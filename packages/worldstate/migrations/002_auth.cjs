/* eslint-disable no-undef */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('player', {
    id: { type: 'text', primaryKey: true },
    username: { type: 'text', notNull: true },
    email: { type: 'text' },
    preferences: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    template_overrides: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('player', { ifExists: true });
};
