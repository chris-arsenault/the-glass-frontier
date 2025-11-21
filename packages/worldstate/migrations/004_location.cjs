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
    kind: { type: 'text', notNull: true, default: 'locale' },
    biome: { type: 'text' },
    description: { type: 'text' },
    tags: { type: 'text[]', notNull: true, default: pgm.func(`'{}'::text[]`) },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('location', 'name', { name: 'location_name_idx' });
  pgm.createIndex('location', 'kind', { name: 'location_kind_idx' });

  pgm.createIndex(
    'edge',
    'src_id',
    { name: 'edge_location_parent_one_parent', unique: true, where: "type = 'location_parent'" }
  );
};

exports.down = (pgm) => {
  pgm.dropIndex('edge', 'src_id', {
    ifExists: true,
    name: 'edge_location_parent_one_parent',
  });
  pgm.dropIndex('location', 'kind', { ifExists: true, name: 'location_kind_idx' });
  pgm.dropIndex('location', 'name', { ifExists: true, name: 'location_name_idx' });
  pgm.dropTable('location', { ifExists: true });
};
