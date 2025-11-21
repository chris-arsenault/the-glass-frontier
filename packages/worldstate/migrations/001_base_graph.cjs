/* eslint-disable no-undef */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension('uuid-ossp', { ifNotExists: true });
  pgm.createExtension('ltree', { ifNotExists: true });

  pgm.createTable('node', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    kind: { type: 'text', notNull: true },
    props: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('edge', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    src_id: { type: 'uuid', notNull: true, references: 'node(id)', onDelete: 'CASCADE' },
    dst_id: { type: 'uuid', notNull: true, references: 'node(id)', onDelete: 'CASCADE' },
    type: { type: 'text', notNull: true },
    props: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('edge', ['src_id', 'type'], { name: 'edge_src_type_idx' });
  pgm.createIndex('edge', ['dst_id', 'type'], { name: 'edge_dst_type_idx' });
  pgm.createIndex('edge', ['src_id', 'dst_id', 'type'], { name: 'edge_src_dst_type_idx', unique: true });
};

exports.down = (pgm) => {
  pgm.dropIndex('edge', ['src_id', 'dst_id', 'type'], { ifExists: true, name: 'edge_src_dst_type_idx' });
  pgm.dropIndex('edge', ['dst_id', 'type'], { ifExists: true, name: 'edge_dst_type_idx' });
  pgm.dropIndex('edge', ['src_id', 'type'], { ifExists: true, name: 'edge_src_type_idx' });
  pgm.dropTable('edge', { ifExists: true });
  pgm.dropTable('node', { ifExists: true });
  pgm.dropExtension('ltree', { ifExists: true });
  pgm.dropExtension('uuid-ossp', { ifExists: true });
};
