#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { WorldState } from '../src/worldState.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SEED_FILE = join(__dirname, 'world-entities-seed-with-lore.json');

interface LoreFragment {
  id: string;
  title: string;
  prose: string;
  tags: string[];
  relatedEntityId: string;
  relationshipType: string;
}

interface Entity {
  id: string;
  kind: string;
  subkind: string;
  name: string;
  status: string;
  description?: string;
  loreFragments?: LoreFragment[];
}

interface Relationship {
  id: string;
  from: string;
  to: string;
  relationshipType: string;
}

interface SeedData {
  version: string;
  metadata: any;
  entities: Record<string, Entity[]>;
  relationships: Relationship[];
}

async function loadSeedData(): Promise<SeedData> {
  const data = await readFile(SEED_FILE, 'utf-8');
  return JSON.parse(data);
}

async function seedWorldEntities() {
  const connectionString =
    process.env.WORLDSTATE_DATABASE_URL ||
    process.env.GLASS_FRONTIER_DATABASE_URL ||
    process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'Database connection string not found. Please set WORLDSTATE_DATABASE_URL, GLASS_FRONTIER_DATABASE_URL, or DATABASE_URL environment variable.'
    );
  }

  console.log('Loading seed data with lore fragments...');
  const seedData = await loadSeedData();

  console.log(`Found ${seedData.metadata.totalEntities} entities across ${seedData.metadata.kinds.length} kinds`);
  console.log(`Found ${seedData.metadata.totalRelationships} relationships`);

  const pool = new Pool({ connectionString });
  const worldState = WorldState.create({ pool });

  // Create a dummy chronicle for lore fragments (required by schema)
  // First create a dummy player, location, and chronicle
  const dummyPlayerId = 'seed-system';
  const dummyLocationId = randomUUID();
  let dummyChronicleId = randomUUID();

  try {
    // Create dummy player
    await pool.query(
      `INSERT INTO app.player (id, username) VALUES ($1, 'World Seed System')
       ON CONFLICT (id) DO NOTHING`,
      [dummyPlayerId]
    );

    // Try to find existing chronicle first, or create new one
    const existingChronicle = await pool.query(
      `SELECT c.id FROM chronicle c
       JOIN location l ON c.location_id = l.id
       WHERE l.slug = 'seed-chronicle-location'
       LIMIT 1`
    );

    if (existingChronicle.rows.length > 0) {
      // Reuse existing chronicle
      dummyChronicleId = existingChronicle.rows[0].id;
      console.log(`Reusing existing chronicle ${dummyChronicleId} for lore fragments`);
    } else {
      // Create dummy location node for chronicle
      await pool.query(
        `INSERT INTO node (id, kind, props) VALUES ($1::uuid, 'location', '{}'::jsonb)`,
        [dummyLocationId]
      );
      await pool.query(
        `INSERT INTO location (id, slug, name, kind) VALUES ($1::uuid, 'seed-chronicle-location', 'Seed Chronicle Location', 'region')`,
        [dummyLocationId]
      );

      // Create dummy chronicle node
      await pool.query(
        `INSERT INTO node (id, kind, props) VALUES ($1::uuid, 'chronicle', '{}'::jsonb)`,
        [dummyChronicleId]
      );
      await pool.query(
        `INSERT INTO chronicle (id, player_id, location_id, status, title)
         VALUES ($1::uuid, $2, $3::uuid, 'closed', 'World Seed Chronicle')`,
        [dummyChronicleId, dummyPlayerId, dummyLocationId]
      );

      console.log(`Created dummy chronicle ${dummyChronicleId} for lore fragments`);
    }
  } catch (error) {
    console.error('Failed to create or find dummy chronicle:', error instanceof Error ? error.message : String(error));
    throw error; // Rethrow to prevent seeding with invalid chronicle
  }

  try {
    // Map old string IDs to new UUIDs
    const idMap = new Map<string, string>();

    // Create all entities first
    console.log('\n=== Seeding Entities ===');
    let entityCount = 0;
    let entityErrors = 0;

    for (const [kind, entities] of Object.entries(seedData.entities)) {
      console.log(`Seeding ${entities.length} ${kind} entities...`);

      for (const entity of entities) {
        try {
          const uuid = randomUUID();
          idMap.set(entity.id, uuid);

          await worldState.world.upsertHardState({
            id: uuid,
            kind: entity.kind as any,
            subkind: entity.subkind as any,
            name: entity.name,
            status: entity.status as any,
          });
          entityCount++;
          if (entityCount === 1) {
            console.log(`✓ First entity success: ${entity.id} -> ${uuid} (${entity.name})`);
          }
        } catch (error) {
          entityErrors++;
          console.error(`✗ Failed to insert entity ${entity.id} (${entity.name}):`, error instanceof Error ? error.message : String(error));
        }
      }
    }

    console.log(`✓ Seeded ${entityCount} entities (${entityErrors} errors)`);

    // Create relationships
    console.log('\n=== Seeding Relationships ===');
    console.log(`ID map has ${idMap.size} entries`);
    let relationshipCount = 0;
    let relationshipErrors = 0;
    let missingIdErrors = 0;

    for (const relationship of seedData.relationships) {
      try {
        const srcUuid = idMap.get(relationship.from);
        const dstUuid = idMap.get(relationship.to);

        if (!srcUuid || !dstUuid) {
          missingIdErrors++;
          if (missingIdErrors <= 5) {
            console.error(`✗ Missing ID mapping for relationship ${relationship.id}: from=${relationship.from} (${srcUuid ? 'found' : 'MISSING'}), to=${relationship.to} (${dstUuid ? 'found' : 'MISSING'})`);
          }
          relationshipErrors++;
          continue;
        }

        // Skip self-referencing relationships (may not be allowed by schema)
        if (srcUuid === dstUuid) {
          relationshipErrors++;
          continue;
        }

        await worldState.world.upsertRelationship({
          srcId: srcUuid,
          dstId: dstUuid,
          relationship: relationship.relationshipType,
        });
        relationshipCount++;
        if (relationshipCount === 1) {
          console.log(`✓ First relationship success: ${relationship.from} -> ${relationship.to} (${relationship.relationshipType})`);
        }
      } catch (error) {
        relationshipErrors++;
        if (relationshipErrors < 10) {
          console.error(`✗ Failed to insert relationship ${relationship.id} (${relationship.from} -> ${relationship.to}):`, error instanceof Error ? error.message : String(error));
          console.error(`  Source UUID: ${idMap.get(relationship.from)}, Dest UUID: ${idMap.get(relationship.to)}`);
        }
      }
    }

    console.log(`Missing ID errors: ${missingIdErrors}`);

    console.log(`✓ Seeded ${relationshipCount} relationships (${relationshipErrors} errors)`);

    // Create lore fragments
    console.log('\n=== Seeding Lore Fragments ===');
    let fragmentCount = 0;
    let fragmentErrors = 0;

    for (const [kind, entities] of Object.entries(seedData.entities)) {
      console.log(`Seeding lore fragments for ${kind} entities...`);

      for (const entity of entities) {
        const entityUuid = idMap.get(entity.id);
        if (!entityUuid || !entity.loreFragments || entity.loreFragments.length === 0) {
          continue;
        }

        for (const fragment of entity.loreFragments) {
          try {
            await worldState.world.createLoreFragment({
              entityId: entityUuid,
              source: {
                chronicleId: dummyChronicleId,
                beatId: undefined,
              },
              title: fragment.title,
              prose: fragment.prose,
              tags: fragment.tags,
            });
            fragmentCount++;
          } catch (error) {
            fragmentErrors++;
            if (fragmentErrors < 10) {
              console.error(`✗ Failed to insert lore fragment for ${entity.name}:`, error instanceof Error ? error.message : String(error));
            }
          }
        }
      }
    }

    console.log(`✓ Seeded ${fragmentCount} lore fragments (${fragmentErrors} errors)`);

    // Display summary statistics
    console.log('\n=== Summary Statistics ===');

    const entityStats = await pool.query(`
      SELECT kind, COUNT(*) as count
      FROM hard_state
      GROUP BY kind
      ORDER BY kind
    `);

    console.log('\nEntities by kind:');
    for (const row of entityStats.rows) {
      console.log(`  ${row.kind}: ${row.count}`);
    }

    const relationshipStats = await pool.query(`
      SELECT type, COUNT(*) as count
      FROM edge
      WHERE type IN (SELECT id FROM world_relationship_kind)
      GROUP BY type
      ORDER BY count DESC
      LIMIT 10
    `);

    console.log('\nTop 10 relationship types:');
    for (const row of relationshipStats.rows) {
      console.log(`  ${row.type}: ${row.count}`);
    }

    const fragmentStats = await pool.query(`
      SELECT COUNT(*) as count
      FROM lore_fragment
    `);

    console.log('\nLore fragments:');
    console.log(`  Total: ${fragmentStats.rows[0].count}`);

    const totalStats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM hard_state) as total_entities,
        (SELECT COUNT(*) FROM edge WHERE type IN (SELECT id FROM world_relationship_kind)) as total_relationships,
        (SELECT COUNT(*) FROM lore_fragment) as total_fragments
    `);

    console.log('\nTotal statistics:');
    console.log(`  Entities: ${totalStats.rows[0].total_entities}`);
    console.log(`  Relationships: ${totalStats.rows[0].total_relationships}`);
    console.log(`  Lore Fragments: ${totalStats.rows[0].total_fragments}`);

    console.log('\n✓ World entity seed complete!');

  } catch (error) {
    console.error('\nFatal error during seeding:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seedWorldEntities().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
