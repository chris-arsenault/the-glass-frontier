/* eslint-disable no-undef */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn({ schema: 'ops', name: 'audit_entry' }, {
    duration_ms: { type: 'integer' },
  });

  pgm.createIndex({ schema: 'ops', name: 'audit_entry' }, 'duration_ms', { name: 'audit_entry_duration_idx' });
};

exports.down = (pgm) => {
  pgm.dropIndex({ schema: 'ops', name: 'audit_entry' }, 'duration_ms', { ifExists: true, name: 'audit_entry_duration_idx' });
  pgm.dropColumn({ schema: 'ops', name: 'audit_entry' }, 'duration_ms', { ifExists: true });
};
