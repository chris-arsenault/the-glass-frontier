#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SEED_FILE = join(__dirname, 'world-entities-seed.json');

interface Entity {
  id: string;
  kind: string;
  subkind: string;
  name: string;
  status: string;
  description?: string;
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

  console.log('Loading seed data...');
  const seedData = await loadSeedData();

  console.log(`Found ${seedData.metadata.totalEntities} entities across ${seedData.metadata.kinds.length} kinds`);
  console.log(`Found ${seedData.metadata.totalRelationships} relationships`);

  const pool = new Pool({ connectionString });

  try {
    await pool.query('BEGIN');

    // Create tables if they don't exist (based on HardState schema)
    console.log('\n=== Creating/Verifying Tables ===');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS world_entity (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        subkind TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS world_relationship (
        id TEXT PRIMARY KEY,
        from_id TEXT NOT NULL REFERENCES world_entity(id) ON DELETE CASCADE,
        to_id TEXT NOT NULL REFERENCES world_entity(id) ON DELETE CASCADE,
        relationship_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(from_id, to_id, relationship_type)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_world_entity_kind ON world_entity(kind)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_world_entity_subkind ON world_entity(subkind)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_world_relationship_from ON world_relationship(from_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_world_relationship_to ON world_relationship(to_id)
    `);

    console.log('✓ Tables and indexes ready');

    // Insert entities
    console.log('\n=== Seeding Entities ===');
    let entityCount = 0;
    let entityErrors = 0;

    for (const [kind, entities] of Object.entries(seedData.entities)) {
      console.log(`Seeding ${entities.length} ${kind} entities...`);

      for (const entity of entities) {
        try {
          await pool.query(
            `INSERT INTO world_entity (id, kind, subkind, name, status, description)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO UPDATE
             SET kind = EXCLUDED.kind,
                 subkind = EXCLUDED.subkind,
                 name = EXCLUDED.name,
                 status = EXCLUDED.status,
                 description = EXCLUDED.description,
                 updated_at = NOW()`,
            [entity.id, entity.kind, entity.subkind, entity.name, entity.status, entity.description || null]
          );
          entityCount++;
        } catch (error) {
          entityErrors++;
          console.error(`✗ Failed to insert entity ${entity.id}:`, error instanceof Error ? error.message : String(error));
        }
      }
    }

    console.log(`✓ Seeded ${entityCount} entities (${entityErrors} errors)`);

    // Insert relationships
    console.log('\n=== Seeding Relationships ===');
    let relationshipCount = 0;
    let relationshipErrors = 0;

    for (const relationship of seedData.relationships) {
      try {
        await pool.query(
          `INSERT INTO world_relationship (id, from_id, to_id, relationship_type)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (from_id, to_id, relationship_type) DO NOTHING`,
          [relationship.id, relationship.from, relationship.to, relationship.relationshipType]
        );
        relationshipCount++;
      } catch (error) {
        relationshipErrors++;
        if (relationshipErrors < 10) {
          console.error(`✗ Failed to insert relationship ${relationship.id}:`, error instanceof Error ? error.message : String(error));
        }
      }
    }

    console.log(`✓ Seeded ${relationshipCount} relationships (${relationshipErrors} errors)`);

    await pool.query('COMMIT');

    // Display summary statistics
    console.log('\n=== Summary Statistics ===');

    const entityStats = await pool.query(`
      SELECT kind, COUNT(*) as count
      FROM world_entity
      GROUP BY kind
      ORDER BY kind
    `);

    console.log('\nEntities by kind:');
    for (const row of entityStats.rows) {
      console.log(`  ${row.kind}: ${row.count}`);
    }

    const relationshipStats = await pool.query(`
      SELECT relationship_type, COUNT(*) as count
      FROM world_relationship
      GROUP BY relationship_type
      ORDER BY count DESC
      LIMIT 10
    `);

    console.log('\nTop 10 relationship types:');
    for (const row of relationshipStats.rows) {
      console.log(`  ${row.relationship_type}: ${row.count}`);
    }

    const totalStats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM world_entity) as total_entities,
        (SELECT COUNT(*) FROM world_relationship) as total_relationships
    `);

    console.log('\nTotal statistics:');
    console.log(`  Entities: ${totalStats.rows[0].total_entities}`);
    console.log(`  Relationships: ${totalStats.rows[0].total_relationships}`);

    console.log('\n✓ World entity seed complete!');

  } catch (error) {
    await pool.query('ROLLBACK');
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
