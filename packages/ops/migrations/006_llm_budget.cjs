/* eslint-disable no-undef */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    { schema: 'ops', name: 'llm_budget_period' },
    {
      player_id: { type: 'text', notNull: true },
      period: { type: 'date', notNull: true },
      spent_usd: { type: 'numeric(14,6)', notNull: true, default: 0 },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    }
  );
  pgm.addConstraint(
    { schema: 'ops', name: 'llm_budget_period' },
    'llm_budget_period_pk',
    { primaryKey: ['player_id', 'period'] }
  );
  pgm.addConstraint(
    { schema: 'ops', name: 'llm_budget_period' },
    'llm_budget_period_amount_check',
    { check: 'spent_usd >= 0' }
  );

  pgm.createTable(
    { schema: 'ops', name: 'llm_budget_entry' },
    {
      id: { type: 'text', primaryKey: true },
      player_id: { type: 'text', notNull: true },
      period: { type: 'date', notNull: true },
      reserved_usd: { type: 'numeric(14,6)', notNull: true },
      spent_usd: { type: 'numeric(14,6)', notNull: true, default: 0 },
      status: { type: 'text', notNull: true },
      expires_at: { type: 'timestamptz', notNull: true },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    }
  );
  pgm.addConstraint(
    { schema: 'ops', name: 'llm_budget_entry' },
    'llm_budget_entry_period_fk',
    {
      foreignKeys: {
        columns: ['player_id', 'period'],
        references: 'ops.llm_budget_period(player_id, period)',
        onDelete: 'CASCADE',
      },
    }
  );
  pgm.addConstraint(
    { schema: 'ops', name: 'llm_budget_entry' },
    'llm_budget_entry_status_check',
    { check: "status IN ('pending', 'settled', 'released', 'expired')" }
  );
  pgm.addConstraint(
    { schema: 'ops', name: 'llm_budget_entry' },
    'llm_budget_entry_amounts_check',
    { check: 'reserved_usd >= 0 AND spent_usd >= 0' }
  );
  pgm.createIndex(
    { schema: 'ops', name: 'llm_budget_entry' },
    ['player_id', 'period', 'status'],
    { name: 'llm_budget_entry_player_period_status_idx' }
  );
  pgm.createIndex(
    { schema: 'ops', name: 'llm_budget_entry' },
    ['expires_at'],
    { name: 'llm_budget_entry_expires_idx', where: "status = 'pending'" }
  );
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'ops', name: 'llm_budget_entry' }, { ifExists: true });
  pgm.dropTable({ schema: 'ops', name: 'llm_budget_period' }, { ifExists: true });
};
