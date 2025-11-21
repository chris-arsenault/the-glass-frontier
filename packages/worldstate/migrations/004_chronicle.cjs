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
    location_id: { type: 'uuid', notNull: true, references: 'hard_state(id)', onDelete: 'RESTRICT' },
    seed_text: { type: 'text' },
    beats_enabled: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('chronicle', 'player_id', { name: 'chronicle_player_idx' });
  pgm.createIndex('chronicle', 'location_id', { name: 'chronicle_location_idx' });

  pgm.createTable('chronicle_turn', {
    // Identity & Relationships
    id: { type: 'uuid', primaryKey: true, references: 'node(id)', onDelete: 'CASCADE' },
    chronicle_id: { type: 'uuid', notNull: true, references: 'chronicle(id)', onDelete: 'CASCADE' },
    turn_sequence: { type: 'integer', notNull: true },

    // Core Metadata
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    handler_id: { type: 'text' },
    executed_nodes: { type: 'text[]', default: pgm.func(`'{}'::text[]`) },

    // Turn Status & Flow Control
    failure: { type: 'boolean', notNull: true, default: false },
    advances_timeline: { type: 'boolean', notNull: true, default: false },
    world_delta_tags: { type: 'text[]', default: pgm.func(`'{}'::text[]`) },

    // Player Input (structured)
    player_message_id: { type: 'text', notNull: true },
    player_message_content: { type: 'text', notNull: true },
    player_message_metadata: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },

    // Intent Resolution
    resolved_intent_type: { type: 'text' },
    player_intent: { type: 'jsonb' },

    // GM Response (structured)
    gm_response_id: { type: 'text' },
    gm_response_content: { type: 'text' },
    gm_response_metadata: { type: 'jsonb', default: pgm.func(`'{}'::jsonb`) },
    gm_summary: { type: 'text' },

    // System Message (optional, for errors/notifications)
    system_message_id: { type: 'text' },
    system_message_content: { type: 'text' },
    system_message_metadata: { type: 'jsonb', default: pgm.func(`'{}'::jsonb`) },

    // Step Results (all optional JSONB)
    skill_check_plan: { type: 'jsonb' },
    skill_check_result: { type: 'jsonb' },
    inventory_delta: { type: 'jsonb' },
    location_delta: { type: 'jsonb' },
    beat_tracker: { type: 'jsonb' },

    // Telemetry & Debugging
    gm_trace: { type: 'jsonb' },
  });

  // Indexes for common query patterns
  pgm.createIndex('chronicle_turn', ['chronicle_id', 'turn_sequence'], {
    name: 'chronicle_turn_chronicle_idx',
    unique: true,
  });
  pgm.createIndex('chronicle_turn', 'chronicle_id', {
    name: 'chronicle_turn_failure_idx',
    where: 'failure = true',
  });
  pgm.createIndex('chronicle_turn', 'resolved_intent_type', {
    name: 'chronicle_turn_intent_type_idx',
    where: 'resolved_intent_type IS NOT NULL',
  });
  pgm.createIndex('chronicle_turn', 'chronicle_id', {
    name: 'chronicle_turn_skill_check_idx',
    where: 'skill_check_result IS NOT NULL',
  });
  pgm.createIndex('chronicle_turn', 'created_at', {
    name: 'chronicle_turn_created_idx',
  });

  // GIN indexes for array and JSONB searches
  pgm.createIndex('chronicle_turn', 'world_delta_tags', {
    name: 'chronicle_turn_world_delta_tags_idx',
    method: 'gin',
  });
  pgm.createIndex('chronicle_turn', 'executed_nodes', {
    name: 'chronicle_turn_executed_nodes_idx',
    method: 'gin',
  });
  pgm.createIndex('chronicle_turn', 'player_intent', {
    name: 'chronicle_turn_intent_gin_idx',
    method: 'gin',
  });
  pgm.createIndex('chronicle_turn', 'gm_trace', {
    name: 'chronicle_turn_trace_gin_idx',
    method: 'gin',
  });

  pgm.createTable('location_event', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    location_id: { type: 'uuid', notNull: true, references: 'hard_state(id)', onDelete: 'CASCADE' },
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

  // Drop chronicle_turn indexes
  pgm.dropIndex('chronicle_turn', 'gm_trace', {
    ifExists: true,
    name: 'chronicle_turn_trace_gin_idx',
  });
  pgm.dropIndex('chronicle_turn', 'player_intent', {
    ifExists: true,
    name: 'chronicle_turn_intent_gin_idx',
  });
  pgm.dropIndex('chronicle_turn', 'executed_nodes', {
    ifExists: true,
    name: 'chronicle_turn_executed_nodes_idx',
  });
  pgm.dropIndex('chronicle_turn', 'world_delta_tags', {
    ifExists: true,
    name: 'chronicle_turn_world_delta_tags_idx',
  });
  pgm.dropIndex('chronicle_turn', 'created_at', {
    ifExists: true,
    name: 'chronicle_turn_created_idx',
  });
  pgm.dropIndex('chronicle_turn', 'chronicle_id', {
    ifExists: true,
    name: 'chronicle_turn_skill_check_idx',
  });
  pgm.dropIndex('chronicle_turn', 'resolved_intent_type', {
    ifExists: true,
    name: 'chronicle_turn_intent_type_idx',
  });
  pgm.dropIndex('chronicle_turn', 'chronicle_id', {
    ifExists: true,
    name: 'chronicle_turn_failure_idx',
  });
  pgm.dropIndex('chronicle_turn', ['chronicle_id', 'turn_sequence'], {
    ifExists: true,
    name: 'chronicle_turn_chronicle_idx',
  });
  pgm.dropTable('chronicle_turn', { ifExists: true });

  pgm.dropIndex('chronicle', 'location_id', { ifExists: true, name: 'chronicle_location_idx' });
  pgm.dropIndex('chronicle', 'player_id', { ifExists: true, name: 'chronicle_player_idx' });
  pgm.dropTable('chronicle', { ifExists: true });
};
