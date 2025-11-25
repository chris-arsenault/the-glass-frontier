/* eslint-disable no-undef */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // Add entity tracking fields to chronicle_turn table
  pgm.addColumn('chronicle_turn', {
    entity_offered: { type: 'jsonb' },
    entity_usage: { type: 'jsonb' },
  });

  // Add GIN indexes for efficient JSONB queries
  pgm.createIndex('chronicle_turn', 'entity_offered', {
    name: 'chronicle_turn_entity_offered_idx',
    method: 'gin',
  });
  pgm.createIndex('chronicle_turn', 'entity_usage', {
    name: 'chronicle_turn_entity_usage_idx',
    method: 'gin',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('chronicle_turn', 'entity_usage', {
    ifExists: true,
    name: 'chronicle_turn_entity_usage_idx',
  });
  pgm.dropIndex('chronicle_turn', 'entity_offered', {
    ifExists: true,
    name: 'chronicle_turn_entity_offered_idx',
  });
  pgm.dropColumn('chronicle_turn', ['entity_offered', 'entity_usage'], { ifExists: true });
};
