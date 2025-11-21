/* eslint-disable no-undef */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createIndex(
    'edge',
    ['src_id'],
    {
      name: 'edge_character_resides_once',
      unique: true,
      where: "type = 'resides_in'",
    }
  );
};

exports.down = (pgm) => {
  pgm.dropIndex('edge', ['src_id'], {
    ifExists: true,
    name: 'edge_character_resides_once',
  });
};
