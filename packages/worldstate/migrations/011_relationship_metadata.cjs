/* eslint-disable no-undef */
exports.shorthands = undefined;

/**
 * Relationship types gain the metadata traversal and ingest validation need:
 * a category (including 'banned', so a verb can be rejected by name) and a
 * default strength used as the prior when an edge carries none.
 */
exports.up = (pgm) => {
  pgm.addColumns('world_relationship_kind', {
    category: { type: 'text', notNull: true, default: 'causal' },
    default_strength: { type: 'real', notNull: true, default: 0.5 },
  });

  pgm.addConstraint('world_relationship_kind', 'world_relationship_kind_strength_range', {
    check: 'default_strength >= 0.0 AND default_strength <= 1.0',
  });

  pgm.createIndex('world_relationship_kind', 'category', {
    name: 'world_relationship_kind_category_idx',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('world_relationship_kind', 'category', {
    ifExists: true,
    name: 'world_relationship_kind_category_idx',
  });
  pgm.dropConstraint('world_relationship_kind', 'world_relationship_kind_strength_range', {
    ifExists: true,
  });
  pgm.dropColumns('world_relationship_kind', ['category', 'default_strength'], { ifExists: true });
};
