/* eslint-disable no-undef */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('character', {
    id: {
      type: 'uuid',
      primaryKey: true,
      references: 'node(id)',
      onDelete: 'CASCADE',
    },
    login_id: {
      type: 'text',
      notNull: true,
      references: 'login(id)',
      onDelete: 'CASCADE',
    },
    name: { type: 'text', notNull: true },
    tags: { type: 'text[]', notNull: true, default: pgm.func(`'{}'::text[]`) },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('character', 'login_id', { name: 'character_login_idx' });
};

exports.down = (pgm) => {
  pgm.dropIndex('character', 'login_id', { ifExists: true, name: 'character_login_idx' });
  pgm.dropTable('character', { ifExists: true });
};
