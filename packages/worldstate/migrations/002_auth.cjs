/* eslint-disable no-undef */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('login', {
    id: { type: 'text', primaryKey: true },
    login_name: { type: 'text', notNull: true },
    email: { type: 'text' },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('player', {
    login_id: {
      type: 'text',
      notNull: true,
      references: 'login(id)',
      onDelete: 'CASCADE',
      primaryKey: true,
    },
    preferences: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    template_overrides: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('player', { ifExists: true });
  pgm.dropTable('login', { ifExists: true });
};
