/* eslint-disable no-undef */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('location', {
    id: {
      type: 'uuid',
      primaryKey: true,
      references: 'node(id)',
      onDelete: 'CASCADE',
    },
    slug: { type: 'text', notNull: true, unique: true },
    name: { type: 'text', notNull: true },
    kind: { type: 'text', notNull: true },
    biome: { type: 'text' },
    tags: { type: 'text[]', notNull: true, default: pgm.func(`'{}'::text[]`) },
    ltree_path: { type: 'ltree' },
    location_root: {
      type: 'uuid',
      notNull: true,
      references: 'node(id)',
      onDelete: 'CASCADE',
    },
    canonical_parent: { type: 'uuid', references: 'node(id)', onDelete: 'SET NULL' },
    description: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('location', 'location_root', { name: 'location_root_idx' });
  pgm.createIndex('location', 'ltree_path', { name: 'location_path_idx', method: 'gist' });

  pgm.createTable('character_location_state', {
    character_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'character(id)',
      onDelete: 'CASCADE',
    },
    location_id: {
      type: 'uuid',
      notNull: true,
      references: 'location(id)',
      onDelete: 'CASCADE',
    },
    anchor_place_id: {
      type: 'uuid',
      notNull: true,
      references: 'location(id)',
      onDelete: 'CASCADE',
    },
    certainty: { type: 'text', notNull: true },
    status: { type: 'text[]', notNull: true, default: pgm.func(`'{}'::text[]`) },
    note: { type: 'text' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('character_location_state', { ifExists: true });
  pgm.dropIndex('location', 'ltree_path', { ifExists: true, name: 'location_path_idx' });
  pgm.dropIndex('location', 'location_root', { ifExists: true, name: 'location_root_idx' });
  pgm.dropTable('location', { ifExists: true });
};
