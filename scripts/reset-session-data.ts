import { Pool } from 'pg';

const connectionString =
  process.env.GLASS_FRONTIER_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/worldstate';

const log = (...args: unknown[]) => {
  console.log('[reset-session-data]', ...args);
};

async function resetSessionData() {
  log('Connecting to database...');
  const pool = new Pool({ connectionString });

  try {
    await pool.query('BEGIN');

    log('Clearing session data while preserving world atlas...');

    // Delete session-specific data in dependency order
    // CASCADE constraints will handle related node/edge cleanup automatically

    const chronicleTurns = await pool.query('SELECT COUNT(*) FROM chronicle_turn');
    log(`Deleting ${chronicleTurns.rows[0].count} chronicle turns...`);
    await pool.query('DELETE FROM chronicle_turn');

    const locationEvents = await pool.query('SELECT COUNT(*) FROM location_event');
    log(`Deleting ${locationEvents.rows[0].count} location events...`);
    await pool.query('DELETE FROM location_event');

    const chronicles = await pool.query('SELECT COUNT(*) FROM chronicle');
    log(`Deleting ${chronicles.rows[0].count} chronicles...`);
    await pool.query('DELETE FROM chronicle');

    const characters = await pool.query('SELECT COUNT(*) FROM character');
    log(`Deleting ${characters.rows[0].count} characters...`);
    await pool.query('DELETE FROM character');

    // Delete chronicle-specific lore fragments (keep world seed lore)
    const chronicleLore = await pool.query(
      'SELECT COUNT(*) FROM lore_fragment WHERE chronicle_id IS NOT NULL'
    );
    log(`Deleting ${chronicleLore.rows[0].count} chronicle-specific lore fragments...`);
    await pool.query('DELETE FROM lore_fragment WHERE chronicle_id IS NOT NULL');

    // Optional: Clear players too (uncomment if you want fresh players each run)
    // const players = await pool.query('SELECT COUNT(*) FROM app.player');
    // log(`Deleting ${players.rows[0].count} players...`);
    // await pool.query('DELETE FROM app.player');

    await pool.query('COMMIT');

    // Display what remains (the world atlas)
    const worldStats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM hard_state) as entities,
        (SELECT COUNT(*) FROM lore_fragment) as lore_fragments,
        (SELECT COUNT(*) FROM edge WHERE type IN (SELECT id FROM world_relationship_kind)) as relationships
    `);

    log('✓ Session data cleared successfully');
    log('World atlas preserved:');
    log(`  - ${worldStats.rows[0].entities} entities`);
    log(`  - ${worldStats.rows[0].lore_fragments} lore fragments`);
    log(`  - ${worldStats.rows[0].relationships} relationships`);
  } catch (error) {
    await pool.query('ROLLBACK');
    log('Error during session reset:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await pool.end();
  }
}

resetSessionData().catch((error) => {
  console.error('[reset-session-data] Failed', error);
  process.exit(1);
});
