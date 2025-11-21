/* eslint-disable no-undef */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('bug_report', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    player_id: { type: 'text', notNull: true },
    summary: { type: 'text', notNull: true },
    details: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'open' },
    chronicle_id: { type: 'uuid' },
    character_id: { type: 'uuid' },
    admin_notes: { type: 'text' },
    backlog_item: { type: 'text' },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('bug_report', 'player_id', { name: 'bug_report_player_idx' });
  pgm.createIndex('bug_report', 'created_at', { name: 'bug_report_created_idx' });
};

exports.down = (pgm) => {
  pgm.dropIndex('bug_report', 'created_at', { ifExists: true, name: 'bug_report_created_idx' });
  pgm.dropIndex('bug_report', 'player_id', { ifExists: true, name: 'bug_report_player_idx' });
  pgm.dropTable('bug_report', { ifExists: true });
};
