/* eslint-disable no-undef */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createSchema('app', { ifNotExists: true });
  pgm.createExtension('uuid-ossp', { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropSchema('app', { ifExists: true, cascade: true });
};
