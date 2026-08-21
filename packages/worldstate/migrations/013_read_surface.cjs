/* eslint-disable no-undef */
exports.shorthands = undefined;

/**
 * Indexes the per-turn context slice depends on.
 *
 * Tag scoring was a sequential scan over `lore_fragment.tags`, and there was no
 * way to match prose at all. Both now back a single ranked query instead of a
 * loop of per-entity lookups.
 */
exports.up = (pgm) => {
  pgm.createIndex('lore_fragment', 'tags', {
    method: 'gin',
    name: 'lore_fragment_tags_idx',
  });

  pgm.sql(`
    ALTER TABLE lore_fragment
    ADD COLUMN search tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(prose, '')), 'B')
    ) STORED
  `);
  pgm.createIndex('lore_fragment', 'search', {
    method: 'gin',
    name: 'lore_fragment_search_idx',
  });

  // Traversal reads edges in both directions and joins the vocabulary for the
  // default strength; entity lookups by kind carry the prominence ordering.
  pgm.createIndex('entity', ['kind', 'prominence'], { name: 'entity_kind_prominence_idx' });
};

exports.down = (pgm) => {
  pgm.dropIndex('entity', ['kind', 'prominence'], {
    ifExists: true,
    name: 'entity_kind_prominence_idx',
  });
  pgm.dropIndex('lore_fragment', 'search', { ifExists: true, name: 'lore_fragment_search_idx' });
  pgm.dropColumn('lore_fragment', 'search', { ifExists: true });
  pgm.dropIndex('lore_fragment', 'tags', { ifExists: true, name: 'lore_fragment_tags_idx' });
};
