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
    player_id: {
      type: 'text',
      notNull: true,
      references: '"app"."player"(id)',
      onDelete: 'CASCADE',
    },
    name: { type: 'text', notNull: true },
    archetype: { type: 'text', notNull: true, default: 'unknown' },
    pronouns: { type: 'text', notNull: true, default: 'unspecified' },
    bio: { type: 'text' },
    attributes: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    skills: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    inventory: { type: 'jsonb', notNull: true, default: pgm.func(`'[]'::jsonb`) },
    momentum: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    tags: { type: 'text[]', notNull: true, default: pgm.func(`'{}'::text[]`) },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('character', 'player_id', { name: 'character_player_idx' });
};

exports.down = (pgm) => {
  pgm.dropIndex('character', 'player_id', { ifExists: true, name: 'character_player_idx' });
  pgm.dropTable('character', { ifExists: true });
};
