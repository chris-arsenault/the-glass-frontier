/* eslint-disable no-undef */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('audit_group', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    scope_type: { type: 'text', notNull: true },
    scope_ref: { type: 'text' },
    player_id: { type: 'text', notNull: true },
    chronicle_id: { type: 'uuid' },
    character_id: { type: 'uuid' },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('audit_group', 'audit_group_scope_unique', {
    unique: ['scope_type', 'scope_ref', 'player_id'],
  });
  pgm.createIndex('audit_group', ['scope_type', 'scope_ref'], { name: 'audit_group_scope_idx' });
  pgm.createIndex('audit_group', 'player_id', { name: 'audit_group_player_idx' });
  pgm.createIndex('audit_group', 'chronicle_id', { name: 'audit_group_chronicle_idx' });

  pgm.createTable('audit_entry', {
    id: { type: 'uuid', primaryKey: true },
    group_id: { type: 'uuid', notNull: true, references: 'audit_group(id)', onDelete: 'CASCADE' },
    player_id: { type: 'text', notNull: true },
    chronicle_id: { type: 'uuid' },
    character_id: { type: 'uuid' },
    turn_id: { type: 'uuid' },
    provider_id: { type: 'text', notNull: true },
    request: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    response: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('audit_entry', 'group_id', { name: 'audit_entry_group_idx' });
  pgm.createIndex('audit_entry', ['created_at', 'id'], { name: 'audit_entry_created_idx' });
  pgm.createIndex('audit_entry', 'player_id', { name: 'audit_entry_player_idx' });
  pgm.createIndex('audit_entry', 'turn_id', { name: 'audit_entry_turn_idx' });
  pgm.createIndex('audit_entry', 'chronicle_id', { name: 'audit_entry_chronicle_idx' });

  pgm.createTable('audit_review', {
    id: { type: 'uuid', primaryKey: true },
    group_id: { type: 'uuid', notNull: true, references: 'audit_group(id)', onDelete: 'CASCADE' },
    audit_id: { type: 'uuid', notNull: true, references: 'audit_entry(id)', onDelete: 'CASCADE' },
    reviewer_id: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true },
    severity: { type: 'text', notNull: true },
    tags: { type: 'text[]', notNull: true, default: pgm.func(`'{}'::text[]`) },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('audit_review', 'group_id', { name: 'audit_review_group_idx' });
  pgm.createIndex('audit_review', 'audit_id', { name: 'audit_review_audit_idx' });
  pgm.createIndex('audit_review', ['reviewer_id', 'created_at'], { name: 'audit_review_reviewer_idx' });

  pgm.createTable('audit_feedback', {
    id: { type: 'uuid', primaryKey: true },
    group_id: { type: 'uuid', notNull: true, references: 'audit_group(id)', onDelete: 'CASCADE' },
    audit_id: { type: 'uuid', references: 'audit_entry(id)', onDelete: 'CASCADE' },
    player_id: { type: 'text', notNull: true },
    sentiment: { type: 'text', notNull: true },
    note: { type: 'text' },
    comment: { type: 'text' },
    chronicle_id: { type: 'uuid', notNull: true },
    turn_id: { type: 'uuid', notNull: true },
    turn_sequence: { type: 'integer', notNull: true, default: 0 },
    gm_entry_id: { type: 'text', notNull: true },
    expected_intent_type: { type: 'text' },
    expected_inventory_delta: { type: 'boolean' },
    expected_inventory_notes: { type: 'text' },
    expected_location_change: { type: 'boolean' },
    expected_location_notes: { type: 'text' },
    expected_skill_check: { type: 'boolean' },
    expected_skill_notes: { type: 'text' },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('audit_feedback', 'group_id', { name: 'audit_feedback_group_idx' });
  pgm.createIndex('audit_feedback', ['player_id', 'created_at'], { name: 'audit_feedback_player_idx' });
};

exports.down = (pgm) => {
  pgm.dropIndex('audit_feedback', ['player_id', 'created_at'], { ifExists: true, name: 'audit_feedback_player_idx' });
  pgm.dropIndex('audit_feedback', 'group_id', { ifExists: true, name: 'audit_feedback_group_idx' });
  pgm.dropTable('audit_feedback', { ifExists: true });

  pgm.dropIndex('audit_review', ['reviewer_id', 'created_at'], { ifExists: true, name: 'audit_review_reviewer_idx' });
  pgm.dropIndex('audit_review', 'audit_id', { ifExists: true, name: 'audit_review_audit_idx' });
  pgm.dropIndex('audit_review', 'group_id', { ifExists: true, name: 'audit_review_group_idx' });
  pgm.dropTable('audit_review', { ifExists: true });

  pgm.dropIndex('audit_entry', 'chronicle_id', { ifExists: true, name: 'audit_entry_chronicle_idx' });
  pgm.dropIndex('audit_entry', 'turn_id', { ifExists: true, name: 'audit_entry_turn_idx' });
  pgm.dropIndex('audit_entry', 'player_id', { ifExists: true, name: 'audit_entry_player_idx' });
  pgm.dropIndex('audit_entry', ['created_at', 'id'], { ifExists: true, name: 'audit_entry_created_idx' });
  pgm.dropIndex('audit_entry', 'group_id', { ifExists: true, name: 'audit_entry_group_idx' });
  pgm.dropTable('audit_entry', { ifExists: true });

  pgm.dropIndex('audit_group', 'chronicle_id', { ifExists: true, name: 'audit_group_chronicle_idx' });
  pgm.dropIndex('audit_group', 'player_id', { ifExists: true, name: 'audit_group_player_idx' });
  pgm.dropIndex('audit_group', ['scope_type', 'scope_ref'], { ifExists: true, name: 'audit_group_scope_idx' });
  pgm.dropConstraint('audit_group', 'audit_group_scope_unique', { ifExists: true });
  pgm.dropTable('audit_group', { ifExists: true });
};
