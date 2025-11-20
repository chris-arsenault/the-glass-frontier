/* eslint-disable no-undef */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('chronicle', {
    id: { type: 'uuid', primaryKey: true, references: 'node(id)', onDelete: 'CASCADE' },
    title: { type: 'text', notNull: true },
    primary_char_id: { type: 'uuid', references: 'character(id)', onDelete: 'SET NULL' },
    status: { type: 'text', notNull: true, default: 'open' },
    player_id: {
      type: 'text',
      notNull: true,
      references: '"app"."player"(id)',
      onDelete: 'CASCADE',
    },
    location_id: { type: 'uuid', notNull: true, references: 'location(id)', onDelete: 'RESTRICT' },
    seed_text: { type: 'text' },
    beats_enabled: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('chronicle', 'player_id', { name: 'chronicle_player_idx' });
  pgm.createIndex('chronicle', 'location_id', { name: 'chronicle_location_idx' });

  pgm.createTable('chronicle_turn', {
    id: { type: 'uuid', primaryKey: true, references: 'node(id)', onDelete: 'CASCADE' },
    chronicle_id: { type: 'uuid', notNull: true, references: 'chronicle(id)', onDelete: 'CASCADE' },
    turn_index: { type: 'integer', notNull: true },
    payload: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    player_input: { type: 'text', notNull: true },
    gm_output: { type: 'text', notNull: true },
    intent_json: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('chronicle_turn', ['chronicle_id', 'turn_index'], {
    name: 'chronicle_turn_chronicle_idx',
    unique: true,
  });

  pgm.createTable('location_event', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    location_id: { type: 'uuid', notNull: true, references: 'location(id)', onDelete: 'CASCADE' },
    chronicle_id: { type: 'uuid', references: 'chronicle(id)', onDelete: 'SET NULL' },
    summary: { type: 'text', notNull: true },
    scope: { type: 'text' },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('location_event', ['location_id', 'created_at'], {
    name: 'location_event_location_idx',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('location_event', ['location_id', 'created_at'], {
    ifExists: true,
    name: 'location_event_location_idx',
  });
  pgm.dropTable('location_event', { ifExists: true });
  pgm.dropIndex('chronicle_turn', ['chronicle_id', 'turn_index'], {
    ifExists: true,
    name: 'chronicle_turn_chronicle_idx',
  });
  pgm.dropTable('chronicle_turn', { ifExists: true });
  pgm.dropIndex('chronicle', 'location_id', { ifExists: true, name: 'chronicle_location_idx' });
  pgm.dropIndex('chronicle', 'player_id', { ifExists: true, name: 'chronicle_player_idx' });
  pgm.dropTable('chronicle', { ifExists: true });
};
