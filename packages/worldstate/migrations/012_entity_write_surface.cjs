/* eslint-disable no-undef */
exports.shorthands = undefined;

/**
 * Reshapes canon storage around a single machine writer.
 *
 * - `hard_state` becomes `entity`; the old name asserted a hard-state/lore split
 *   the table never encoded.
 * - `node` drops `props` and becomes pure identity — the thing edges point at.
 *   Entities, lore, and turns wrote it and never read it back. Chronicles and
 *   characters did read it, so their serialized form moves onto their own
 *   tables first rather than living in a table shared with every other kind.
 * - Entities and edges gain `source`, `source_id`, and `batch_id` so an ingest
 *   batch is attributable and revertible, and entities gain `external_key` so a
 *   re-import updates rather than duplicates.
 */
exports.up = (pgm) => {
  pgm.renameTable('hard_state', 'entity');

  // Chronicles and characters keep a serialized form; move it off the shared
  // node table onto their own, then retire node.props.
  pgm.addColumn('chronicle', {
    props: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
  });
  pgm.addColumn('character', {
    props: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
  });
  pgm.sql('UPDATE chronicle c SET props = n.props FROM node n WHERE n.id = c.id');
  pgm.sql('UPDATE character ch SET props = n.props FROM node n WHERE n.id = ch.id');

  pgm.dropColumn('node', 'props', { ifExists: true });

  pgm.addColumns('entity', {
    batch_id: { type: 'uuid' },
    external_key: { type: 'text' },
    source: { type: 'text', notNull: true, default: 'seed' },
    source_id: { type: 'text' },
  });

  pgm.addConstraint('entity', 'entity_source_check', {
    check: "source IN ('import', 'seed', 'play', 'author')",
  });
  pgm.createIndex('entity', ['source', 'external_key'], {
    name: 'entity_source_external_key_idx',
    unique: true,
    where: 'external_key IS NOT NULL',
  });
  pgm.createIndex('entity', 'batch_id', {
    name: 'entity_batch_idx',
    where: 'batch_id IS NOT NULL',
  });

  pgm.addColumns('edge', {
    batch_id: { type: 'uuid' },
    source: { type: 'text', notNull: true, default: 'seed' },
    source_id: { type: 'text' },
  });
  pgm.addConstraint('edge', 'edge_source_check', {
    check: "source IN ('import', 'seed', 'play', 'author')",
  });
  pgm.createIndex('edge', 'batch_id', {
    name: 'edge_batch_idx',
    where: 'batch_id IS NOT NULL',
  });

  pgm.addColumns('lore_fragment', {
    batch_id: { type: 'uuid' },
    external_key: { type: 'text' },
    source: { type: 'text', notNull: true, default: 'seed' },
    source_id: { type: 'text' },
  });
  pgm.addConstraint('lore_fragment', 'lore_fragment_source_check', {
    check: "source IN ('import', 'seed', 'play', 'author')",
  });
  pgm.createIndex('lore_fragment', ['source', 'external_key'], {
    name: 'lore_fragment_source_external_key_idx',
    unique: true,
    where: 'external_key IS NOT NULL',
  });
  pgm.createIndex('lore_fragment', 'batch_id', {
    name: 'lore_fragment_batch_idx',
    where: 'batch_id IS NOT NULL',
  });

  // A batch is the unit of attribution and of reversal.
  pgm.createTable('ingest_batch', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    source: { type: 'text', notNull: true },
    source_id: { type: 'text' },
    entity_count: { type: 'integer', notNull: true, default: 0 },
    relationship_count: { type: 'integer', notNull: true, default: 0 },
    lore_count: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('ingest_batch', 'ingest_batch_source_check', {
    check: "source IN ('import', 'seed', 'play', 'author')",
  });
  pgm.createIndex('ingest_batch', 'created_at', { name: 'ingest_batch_created_idx' });
};

exports.down = (pgm) => {
  pgm.dropTable('ingest_batch', { ifExists: true });

  pgm.dropIndex('lore_fragment', 'batch_id', { ifExists: true, name: 'lore_fragment_batch_idx' });
  pgm.dropIndex('lore_fragment', ['source', 'external_key'], {
    ifExists: true,
    name: 'lore_fragment_source_external_key_idx',
  });
  pgm.dropConstraint('lore_fragment', 'lore_fragment_source_check', { ifExists: true });
  pgm.dropColumns('lore_fragment', ['batch_id', 'external_key', 'source', 'source_id'], {
    ifExists: true,
  });

  pgm.dropIndex('edge', 'batch_id', { ifExists: true, name: 'edge_batch_idx' });
  pgm.dropConstraint('edge', 'edge_source_check', { ifExists: true });
  pgm.dropColumns('edge', ['batch_id', 'source', 'source_id'], { ifExists: true });

  pgm.dropIndex('entity', 'batch_id', { ifExists: true, name: 'entity_batch_idx' });
  pgm.dropIndex('entity', ['source', 'external_key'], {
    ifExists: true,
    name: 'entity_source_external_key_idx',
  });
  pgm.dropConstraint('entity', 'entity_source_check', { ifExists: true });
  pgm.dropColumns('entity', ['batch_id', 'external_key', 'source', 'source_id'], {
    ifExists: true,
  });

  pgm.addColumn('node', {
    props: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
  });
  pgm.sql('UPDATE node n SET props = c.props FROM chronicle c WHERE c.id = n.id');
  pgm.sql('UPDATE node n SET props = ch.props FROM character ch WHERE ch.id = n.id');
  pgm.dropColumn('character', 'props', { ifExists: true });
  pgm.dropColumn('chronicle', 'props', { ifExists: true });

  pgm.renameTable('entity', 'hard_state');
};
