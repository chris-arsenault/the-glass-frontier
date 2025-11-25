import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const connectionString =
  process.env.GLASS_FRONTIER_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/worldstate';

const DEV_PLAYER_ID = 'playwright-e2e'; // Must match the local auth player ID
const DEV_CHARACTER_ID = randomUUID();
const DEV_CHRONICLE_ID = randomUUID();

const log = (...args: unknown[]) => {
  console.log('[seed-dev-fixtures]', ...args);
};

async function seedDevFixtures() {
  log('Creating default character and chronicle for development...');
  const pool = new Pool({ connectionString });

  try {
    // Create dev player (matches local auth)
    await pool.query(
      `INSERT INTO app.player (id, username) VALUES ($1, 'playwright-e2e')
       ON CONFLICT (id) DO NOTHING`,
      [DEV_PLAYER_ID]
    );

    // Find a location and faction from the seeded world to use
    const locationResult = await pool.query(`
      SELECT id, name FROM hard_state
      WHERE kind = 'location'
      ORDER BY prominence DESC, created_at ASC
      LIMIT 1
    `);

    const factionResult = await pool.query(`
      SELECT id, name FROM hard_state
      WHERE kind = 'faction'
      ORDER BY prominence DESC, created_at ASC
      LIMIT 1
    `);

    if (locationResult.rows.length === 0) {
      throw new Error('No locations found in world data. Run world seed first.');
    }

    const location = locationResult.rows[0];
    const anchor = factionResult.rows.length > 0 ? factionResult.rows[0] : null;

    log(`Using location: ${location.name}`);
    if (anchor) {
      log(`Using anchor: ${anchor.name}`);
    }

    // Build character data
    const characterData = {
      id: DEV_CHARACTER_ID,
      playerId: DEV_PLAYER_ID,
      name: 'Dev Scout',
      archetype: 'Explorer',
      pronouns: 'they/them',
      bio: 'A development character for testing the game.',
      attributes: {
        vitality: 'standard',
        resolve: 'standard',
        focus: 'standard',
        presence: 'standard',
        finesse: 'standard',
        ingenuity: 'standard',
        attunement: 'standard',
      },
      skills: {
        navigation: { name: 'navigation', tier: 'apprentice', attribute: 'focus', xp: 0 },
      },
      inventory: [],
      momentum: { current: 0, floor: -2, ceiling: 3 },
      tags: ['dev'],
    };

    // Create node for character (stores full character data in props)
    await pool.query(
      `INSERT INTO node (id, kind, props)
       VALUES ($1, 'character', $2::jsonb)
       ON CONFLICT (id) DO UPDATE SET props = EXCLUDED.props`,
      [DEV_CHARACTER_ID, JSON.stringify(characterData)]
    );

    // Create default character
    await pool.query(
      `INSERT INTO character (id, player_id, name, archetype, pronouns, bio, attributes, skills, inventory, momentum, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         archetype = EXCLUDED.archetype,
         pronouns = EXCLUDED.pronouns,
         bio = EXCLUDED.bio,
         attributes = EXCLUDED.attributes,
         skills = EXCLUDED.skills,
         inventory = EXCLUDED.inventory,
         momentum = EXCLUDED.momentum,
         tags = EXCLUDED.tags`,
      [
        DEV_CHARACTER_ID,
        DEV_PLAYER_ID,
        'Dev Scout',
        'Explorer',
        'they/them',
        'A development character for testing the game.',
        JSON.stringify({
          vitality: 'standard',
          resolve: 'standard',
          focus: 'standard',
          presence: 'standard',
          finesse: 'standard',
          ingenuity: 'standard',
          attunement: 'standard',
        }),
        JSON.stringify({
          navigation: { name: 'navigation', tier: 'apprentice', attribute: 'focus', xp: 0 },
        }),
        JSON.stringify([]),
        JSON.stringify({ current: 0, floor: -2, ceiling: 3 }),
        ['dev'],
      ]
    );
    log(`✓ Created character: Dev Scout`);

    // Build chronicle data
    const chronicleData = {
      id: DEV_CHRONICLE_ID,
      playerId: DEV_PLAYER_ID,
      locationId: location.id,
      anchorEntityId: anchor?.id || null,
      characterId: DEV_CHARACTER_ID,
      title: 'Dev Chronicle',
      status: 'open',
      beatsEnabled: true,
      beats: [],
      summaries: [],
    };

    // Create node for chronicle (stores full chronicle data in props)
    await pool.query(
      `INSERT INTO node (id, kind, props)
       VALUES ($1, 'chronicle', $2::jsonb)
       ON CONFLICT (id) DO UPDATE SET props = EXCLUDED.props`,
      [DEV_CHRONICLE_ID, JSON.stringify(chronicleData)]
    );

    // Create default chronicle
    await pool.query(
      `INSERT INTO chronicle (id, player_id, location_id, anchor_entity_id, title, status, beats_enabled, primary_char_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         status = EXCLUDED.status,
         location_id = EXCLUDED.location_id,
         anchor_entity_id = EXCLUDED.anchor_entity_id,
         primary_char_id = EXCLUDED.primary_char_id`,
      [
        DEV_CHRONICLE_ID,
        DEV_PLAYER_ID,
        location.id,
        anchor?.id || null,
        'Dev Chronicle',
        'open',
        true,
        DEV_CHARACTER_ID,
      ]
    );
    log(`✓ Created chronicle: Dev Chronicle`);
    log(`✓ Chronicle ID: ${DEV_CHRONICLE_ID}`);
    log(`✓ Character ID: ${DEV_CHARACTER_ID}`);

    log('Dev fixtures ready!');
  } catch (error) {
    log('Error creating dev fixtures:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await pool.end();
  }
}

seedDevFixtures().catch((error) => {
  console.error('[seed-dev-fixtures] Failed', error);
  process.exit(1);
});
