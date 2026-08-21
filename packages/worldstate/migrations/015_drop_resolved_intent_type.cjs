/* eslint-disable no-undef */
exports.shorthands = undefined;

// resolved_intent_type was never written by the GM graph; the canonical intent
// lives inside player_intent.
exports.up = (pgm) => {
  pgm.dropIndex('chronicle_turn', 'resolved_intent_type', {
    ifExists: true,
    name: 'chronicle_turn_intent_type_idx',
  });
  pgm.dropColumn('chronicle_turn', 'resolved_intent_type', { ifExists: true });
};

exports.down = (pgm) => {
  pgm.addColumn('chronicle_turn', {
    resolved_intent_type: { type: 'text' },
  });
  pgm.createIndex('chronicle_turn', 'resolved_intent_type', {
    name: 'chronicle_turn_intent_type_idx',
    where: 'resolved_intent_type IS NOT NULL',
  });
};
