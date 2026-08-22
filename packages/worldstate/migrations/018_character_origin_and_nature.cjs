/* eslint-disable no-undef */
exports.shorthands = undefined;

/**
 * Character creation gained a canon origin and a narrative core.
 *
 * These columns mirror `character.props`, the same way `name`, `archetype`,
 * `bio` and `tags` already do: `props` stays the source of truth and the DTO is
 * the enforcement point, so the mirrors are nullable and exist for querying.
 *
 * The four canon ids deliberately carry no foreign key to `entity`. Canon is
 * corrected by reverting an ingest batch, which deletes entity rows; a
 * character reference must not be able to block that.
 */
exports.up = (pgm) => {
  pgm.addColumns('character', {
    species_id: { type: 'uuid' },
    culture_id: { type: 'uuid' },
    homeland_id: { type: 'uuid' },
    allegiance_id: { type: 'uuid' },
    allegiance_stance: { type: 'text' },
    callings: { type: 'text[]', notNull: true, default: pgm.func(`'{}'::text[]`) },
    drive: { type: 'text' },
    flaw: { type: 'text' },
    instinct: { type: 'text' },
    unique_thing: { type: 'text' },
  });

  pgm.addConstraint('character', 'character_allegiance_stance_check', {
    check: "allegiance_stance IS NULL OR allegiance_stance IN ('member','indebted','estranged','hunted')",
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('character', 'character_allegiance_stance_check', { ifExists: true });
  pgm.dropColumns(
    'character',
    [
      'species_id',
      'culture_id',
      'homeland_id',
      'allegiance_id',
      'allegiance_stance',
      'callings',
      'drive',
      'flaw',
      'instinct',
      'unique_thing',
    ],
    { ifExists: true }
  );
};
