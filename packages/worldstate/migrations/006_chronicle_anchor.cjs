/* eslint-disable no-undef */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('chronicle', {
    anchor_entity_id: { type: 'uuid', references: 'hard_state(id)', onDelete: 'SET NULL' },
  });
  pgm.createIndex('chronicle', 'anchor_entity_id', { name: 'chronicle_anchor_entity_idx' });
};

exports.down = (pgm) => {
  pgm.dropIndex('chronicle', 'anchor_entity_id', {
    ifExists: true,
    name: 'chronicle_anchor_entity_idx',
  });
  pgm.dropColumns('chronicle', ['anchor_entity_id'], { ifExists: true });
};
