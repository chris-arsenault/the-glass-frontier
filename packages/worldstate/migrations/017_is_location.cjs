/* eslint-disable no-undef */
exports.shorthands = undefined;

// The game-layer "location" concept is a property of the entity, not a kind
// list: defaulted from the kind at ingest and overridable per entity.
exports.up = (pgm) => {
  pgm.addColumn('entity', {
    is_location: { type: 'boolean', notNull: true, default: false },
  });
  pgm.createIndex('entity', 'is_location', {
    name: 'entity_is_location_idx',
    where: 'is_location = true',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('entity', 'is_location', { ifExists: true, name: 'entity_is_location_idx' });
  pgm.dropColumn('entity', 'is_location', { ifExists: true });
};
