/* eslint-disable no-undef */
exports.shorthands = undefined;

// The source world schema declares no status vocabulary, so entity status is
// free text; the per-kind status table stays only as an empty vocabulary shell.
// `props` carries the entry's fact card ({ facts: {...} }), mirroring the
// source's typed kind fields without modeling each one as a column.
exports.up = (pgm) => {
  pgm.dropConstraint('entity', 'hard_state_status_fk', { ifExists: true });
  pgm.addColumn('entity', {
    props: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('entity', 'props', { ifExists: true });
  pgm.addConstraint('entity', 'hard_state_status_fk', {
    foreignKeys: {
      columns: ['kind', 'status'],
      references: 'world_kind_status(kind_id, status)',
    },
  });
};
