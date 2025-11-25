/* eslint-disable no-undef, @typescript-eslint/no-require-imports */

exports.shorthands = undefined;

exports.up = async (pgm) => {
  pgm.createTable(
    { schema: 'ops', name: 'model_usage' },
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      player_id: { type: 'text', notNull: true },
      model_id: { type: 'text', notNull: true },
      provider_id: { type: 'text', notNull: true },
      input_tokens: { type: 'bigint', notNull: true, default: 0 },
      output_tokens: { type: 'bigint', notNull: true, default: 0 },
      request_count: { type: 'bigint', notNull: true, default: 0 },
      date: { type: 'date', notNull: true, default: pgm.func('CURRENT_DATE') },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { ifNotExists: true }
  );

  pgm.createIndex(
    { schema: 'ops', name: 'model_usage' },
    ['player_id', 'model_id', 'date'],
    {
      name: 'model_usage_player_model_date_idx',
      unique: true,
      ifNotExists: true,
    }
  );

  pgm.createIndex(
    { schema: 'ops', name: 'model_usage' },
    ['date'],
    {
      name: 'model_usage_date_idx',
      ifNotExists: true,
    }
  );
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'ops', name: 'model_usage' }, { ifExists: true });
};
