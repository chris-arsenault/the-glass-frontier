/* eslint-disable no-undef */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // Add strength column to edge table
  // Range: 0.0 (weak/spatial) to 1.0 (strong/narrative)
  // Nullable to support backward compatibility with existing edges
  pgm.addColumn('edge', {
    strength: { type: 'real', notNull: false },
  });

  // Add index for querying edges by strength
  pgm.createIndex('edge', 'strength', {
    name: 'edge_strength_idx',
    where: 'strength IS NOT NULL',
  });

  // Add check constraint to ensure strength is between 0.0 and 1.0
  pgm.addConstraint('edge', 'edge_strength_range', {
    check: 'strength IS NULL OR (strength >= 0.0 AND strength <= 1.0)',
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('edge', 'edge_strength_range', { ifExists: true });
  pgm.dropIndex('edge', 'strength', { ifExists: true, name: 'edge_strength_idx' });
  pgm.dropColumn('edge', 'strength', { ifExists: true });
};
