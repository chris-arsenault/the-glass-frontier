/* eslint-disable no-undef */
exports.shorthands = undefined;

// handler_id and world_delta_tags were never written by the GM graph.
exports.up = (pgm) => {
  pgm.dropIndex('chronicle_turn', 'world_delta_tags', {
    ifExists: true,
    name: 'chronicle_turn_world_delta_tags_idx',
  });
  pgm.dropColumn('chronicle_turn', 'handler_id', { ifExists: true });
  pgm.dropColumn('chronicle_turn', 'world_delta_tags', { ifExists: true });
};

exports.down = (pgm) => {
  pgm.addColumn('chronicle_turn', {
    handler_id: { type: 'text' },
    world_delta_tags: { type: 'text[]', default: pgm.func(`'{}'::text[]`) },
  });
  pgm.createIndex('chronicle_turn', 'world_delta_tags', {
    method: 'gin',
    name: 'chronicle_turn_world_delta_tags_idx',
  });
};
