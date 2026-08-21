/* eslint-disable no-undef */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('chronicle_session_state', {
    character_state: { type: 'jsonb' },
    chronicle_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'chronicle(id)',
      onDelete: 'CASCADE',
    },
    last_turn_sequence: { type: 'integer', notNull: true, default: -1 },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.sql(`
    INSERT INTO chronicle_session_state (chronicle_id, last_turn_sequence)
    SELECT c.id, COALESCE(MAX(ct.turn_sequence), -1)
    FROM chronicle c
    LEFT JOIN chronicle_turn ct ON ct.chronicle_id = c.id
    GROUP BY c.id
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('chronicle_session_state', { ifExists: true });
};
