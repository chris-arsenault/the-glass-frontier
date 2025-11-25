/* eslint-disable no-undef */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createSchema('ops', { ifNotExists: true });

  pgm.createTable({ schema: 'ops', name: 'token_usage' }, {
    player_id: { type: 'text', notNull: true },
    usage_period: { type: 'text', notNull: true },
    total_requests: { type: 'integer', notNull: true, default: 0 },
    metrics: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint({ schema: 'ops', name: 'token_usage' }, 'token_usage_pk', {
    primaryKey: ['player_id', 'usage_period'],
  });
  pgm.createIndex({ schema: 'ops', name: 'token_usage' }, 'player_id', { name: 'token_usage_player_idx' });
  pgm.createIndex({ schema: 'ops', name: 'token_usage' }, ['player_id', 'usage_period'], {
    name: 'token_usage_period_idx',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex({ schema: 'ops', name: 'token_usage' }, ['player_id', 'usage_period'], {
    ifExists: true,
    name: 'token_usage_period_idx',
  });
  pgm.dropIndex({ schema: 'ops', name: 'token_usage' }, 'player_id', { ifExists: true, name: 'token_usage_player_idx' });
  pgm.dropTable({ schema: 'ops', name: 'token_usage' }, { ifExists: true });
};
