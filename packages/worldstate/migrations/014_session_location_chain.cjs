/* eslint-disable no-undef */
exports.shorthands = undefined;

/**
 * Places discovered during play, and how the player got to each one.
 *
 * `location_state` holds only where the player is now, so a chronicle that
 * wandered off the canon graph lost every place it had been and had no route
 * back. The chain keeps those places and their origin edge for the life of the
 * chronicle. It is session state, not canon: nothing here reaches the graph
 * unless a close-time batch commits it.
 */
exports.up = (pgm) => {
  pgm.addColumn('chronicle_session_state', {
    discovered_locations: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func(`'[]'::jsonb`),
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('chronicle_session_state', 'discovered_locations', { ifExists: true });
};
