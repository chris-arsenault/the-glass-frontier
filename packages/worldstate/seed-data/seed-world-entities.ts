#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SEED_FILE = join(__dirname, 'world-entities-seed-with-lore.json');
const BATCH_SIZE = 100;

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

function toSnakeCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64);
}

async function seedWorldEntities() {
  const connectionString =
    process.env.WORLDSTATE_DATABASE_URL ||
    process.env.GLASS_FRONTIER_DATABASE_URL ||
    process.env.DATABASE_URL;

  // Support both connection string and individual PG* env vars
  const hasIndividualVars = process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE;

  if (!connectionString && !hasIndividualVars) {
    throw new Error(
      'Database connection not found. Set WORLDSTATE_DATABASE_URL/GLASS_FRONTIER_DATABASE_URL/DATABASE_URL, or use PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE env vars.'
    );
  }

  console.log('Loading seed data with lore fragments...');
  const seedData = await loadSeedData();

  console.log(`Found ${seedData.metadata.totalEntities} entities across ${seedData.metadata.kinds.length} kinds`);
  console.log(`Found ${seedData.metadata.totalRelationships} relationships`);

  // Create pool - prefer individual vars (avoids URL encoding issues with special chars in password)
  const pool = hasIndividualVars
    ? new Pool({
        host: process.env.PGHOST,
        port: parseInt(process.env.PGPORT || '5432', 10),
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
      })
    : new Pool({ connectionString });

  const dummyPlayerId = 'seed-system';
  let dummyChronicleId = randomUUID();

  try {
    // Create dummy player first
    console.log('\n=== Setting up seed player ===');
    await pool.query(
      `INSERT INTO app.player (id, username) VALUES ($1, 'World Seed System')
       ON CONFLICT (id) DO NOTHING`,
      [dummyPlayerId]
    );
    console.log('✓ Seed player ready');

    // Map old string IDs to new UUIDs
    const idMap = new Map<string, string>();

    // Prepare all entities with UUIDs
    const allEntities: Array<{
      uuid: string;
      slug: string;
      entity: Entity;
    }> = [];

    for (const [_kind, entities] of Object.entries(seedData.entities)) {
      for (const entity of entities) {
        const uuid = randomUUID();
        const slug = toSnakeCase(entity.name);
        idMap.set(entity.id, uuid);
        allEntities.push({ uuid, slug, entity });
      }
    }

    // Bulk insert entities
    console.log('\n=== Bulk inserting entities ===');
    let entityCount = 0;

    for (let i = 0; i < allEntities.length; i += BATCH_SIZE) {
      const batch = allEntities.slice(i, i + BATCH_SIZE);

      // Build bulk insert for node table
      const nodeValues: string[] = [];
      const nodeParams: unknown[] = [];
      let nodeParamIdx = 1;

      for (const { uuid, entity } of batch) {
        const props = {
          id: uuid,
          slug: toSnakeCase(entity.name),
          kind: entity.kind,
          subkind: entity.subkind || undefined,
          name: entity.name,
          description: entity.description || undefined,
          prominence: 'recognized',
          status: entity.status || undefined,
          links: [],
        };
        nodeValues.push(`($${nodeParamIdx}::uuid, $${nodeParamIdx + 1}, $${nodeParamIdx + 2}::jsonb, now())`);
        nodeParams.push(uuid, 'world_entity', JSON.stringify(props));
        nodeParamIdx += 3;
      }

      await pool.query(
        `INSERT INTO node (id, kind, props, created_at) VALUES ${nodeValues.join(', ')}
         ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, props = EXCLUDED.props`,
        nodeParams
      );

      // Build bulk insert for hard_state table
      const hsValues: string[] = [];
      const hsParams: unknown[] = [];
      let hsParamIdx = 1;

      for (const { uuid, slug, entity } of batch) {
        hsValues.push(
          `($${hsParamIdx}::uuid, $${hsParamIdx + 1}, $${hsParamIdx + 2}, $${hsParamIdx + 3}, $${hsParamIdx + 4}, $${hsParamIdx + 5}, $${hsParamIdx + 6}, $${hsParamIdx + 7}, now(), now())`
        );
        hsParams.push(
          uuid,
          slug,
          entity.kind,
          entity.subkind || null,
          entity.name,
          entity.description || null,
          'recognized',
          entity.status || null
        );
        hsParamIdx += 8;
      }

      await pool.query(
        `INSERT INTO hard_state (id, slug, kind, subkind, name, description, prominence, status, created_at, updated_at)
         VALUES ${hsValues.join(', ')}
         ON CONFLICT (id) DO UPDATE SET
           slug = EXCLUDED.slug,
           kind = EXCLUDED.kind,
           subkind = EXCLUDED.subkind,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           prominence = EXCLUDED.prominence,
           status = EXCLUDED.status,
           updated_at = now()`,
        hsParams
      );

      entityCount += batch.length;
      process.stdout.write(`\r  Inserted ${entityCount}/${allEntities.length} entities`);
    }
    console.log(`\n✓ Inserted ${entityCount} entities`);

    // Bulk insert relationships
    console.log('\n=== Bulk inserting relationships ===');
    let relationshipCount = 0;
    let skippedCount = 0;

    // Filter valid relationships first
    const validRelationships: Array<{ srcUuid: string; dstUuid: string; type: string }> = [];
    for (const rel of seedData.relationships) {
      const srcUuid = idMap.get(rel.from);
      const dstUuid = idMap.get(rel.to);
      if (srcUuid && dstUuid && srcUuid !== dstUuid) {
        validRelationships.push({ srcUuid, dstUuid, type: rel.relationshipType });
      } else {
        skippedCount++;
      }
    }

    for (let i = 0; i < validRelationships.length; i += BATCH_SIZE) {
      const batch = validRelationships.slice(i, i + BATCH_SIZE);

      const edgeValues: string[] = [];
      const edgeParams: unknown[] = [];
      let paramIdx = 1;

      for (const { srcUuid, dstUuid, type } of batch) {
        const edgeId = randomUUID();
        edgeValues.push(
          `($${paramIdx}::uuid, $${paramIdx + 1}::uuid, $${paramIdx + 2}::uuid, $${paramIdx + 3}, '{}'::jsonb, NULL, now())`
        );
        edgeParams.push(edgeId, srcUuid, dstUuid, type);
        paramIdx += 4;
      }

      // Use INSERT ... ON CONFLICT to handle any duplicates
      await pool.query(
        `INSERT INTO edge (id, src_id, dst_id, type, props, strength, created_at)
         VALUES ${edgeValues.join(', ')}
         ON CONFLICT DO NOTHING`,
        edgeParams
      );

      relationshipCount += batch.length;
      process.stdout.write(`\r  Inserted ${relationshipCount}/${validRelationships.length} relationships`);
    }
    console.log(`\n✓ Inserted ${relationshipCount} relationships (skipped ${skippedCount})`);

    // Create chronicle for lore fragments
    console.log('\n=== Creating seed chronicle ===');

    const factionToLocationRel = seedData.relationships.find((r) => {
      const fromEntity = Object.values(seedData.entities)
        .flat()
        .find((e) => e.id === r.from);
      const toEntity = Object.values(seedData.entities)
        .flat()
        .find((e) => e.id === r.to);
      return fromEntity?.kind === 'faction' && toEntity?.kind === 'location';
    });

    if (!factionToLocationRel) {
      throw new Error('No faction->location relationship found in seed data');
    }

    const anchorFactionId = idMap.get(factionToLocationRel.from);
    const chronicleLocationId = idMap.get(factionToLocationRel.to);

    if (!anchorFactionId || !chronicleLocationId) {
      throw new Error('Failed to find UUIDs for anchor faction or chronicle location');
    }

    const anchorFaction = Object.values(seedData.entities)
      .flat()
      .find((e) => e.id === factionToLocationRel.from);

    // Check for existing chronicle
    const existingChronicle = await pool.query(
      `SELECT c.id FROM chronicle c
       WHERE c.location_id = $1::uuid AND c.anchor_entity_id = $2::uuid
       LIMIT 1`,
      [chronicleLocationId, anchorFactionId]
    );

    if (existingChronicle.rows.length > 0) {
      dummyChronicleId = existingChronicle.rows[0].id;
      console.log(`✓ Reusing existing chronicle ${dummyChronicleId}`);
    } else {
      // Insert chronicle node
      await pool.query(
        `INSERT INTO node (id, kind, props, created_at)
         VALUES ($1::uuid, 'chronicle', $2::jsonb, now())
         ON CONFLICT (id) DO NOTHING`,
        [dummyChronicleId, JSON.stringify({ id: dummyChronicleId })]
      );

      // Insert chronicle record
      await pool.query(
        `INSERT INTO chronicle (id, player_id, location_id, anchor_entity_id, title, status, beats_enabled, created_at, updated_at)
         VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, 'closed', false, now(), now())
         ON CONFLICT (id) DO NOTHING`,
        [dummyChronicleId, dummyPlayerId, chronicleLocationId, anchorFactionId, `World Seed Chronicle - ${anchorFaction?.name}`]
      );
      console.log(`✓ Created chronicle ${dummyChronicleId}`);
    }

    // Bulk insert lore fragments
    console.log('\n=== Bulk inserting lore fragments ===');
    let fragmentCount = 0;

    // Collect all lore fragments
    const allFragments: Array<{
      id: string;
      slug: string;
      entityUuid: string;
      fragment: LoreFragment;
    }> = [];

    for (const [_kind, entities] of Object.entries(seedData.entities)) {
      for (const entity of entities) {
        const entityUuid = idMap.get(entity.id);
        if (!entityUuid || !entity.loreFragments || entity.loreFragments.length === 0) {
          continue;
        }

        for (const fragment of entity.loreFragments) {
          const id = randomUUID();
          const slug = `frag_${toSnakeCase(fragment.title)}_${id.slice(0, 8)}`;
          allFragments.push({ id, slug, entityUuid, fragment });
        }
      }
    }

    for (let i = 0; i < allFragments.length; i += BATCH_SIZE) {
      const batch = allFragments.slice(i, i + BATCH_SIZE);

      // Build bulk insert for node table
      const nodeValues: string[] = [];
      const nodeParams: unknown[] = [];
      let nodeParamIdx = 1;

      for (const { id, slug, entityUuid, fragment } of batch) {
        const props = {
          id,
          slug,
          entityId: entityUuid,
          source: { chronicleId: dummyChronicleId },
          title: fragment.title,
          prose: fragment.prose,
          tags: fragment.tags || [],
          timestamp: Date.now(),
        };
        nodeValues.push(`($${nodeParamIdx}::uuid, $${nodeParamIdx + 1}, $${nodeParamIdx + 2}::jsonb, now())`);
        nodeParams.push(id, 'lore_fragment', JSON.stringify(props));
        nodeParamIdx += 3;
      }

      await pool.query(
        `INSERT INTO node (id, kind, props, created_at) VALUES ${nodeValues.join(', ')}
         ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, props = EXCLUDED.props`,
        nodeParams
      );

      // Build bulk insert for lore_fragment table
      const lfValues: string[] = [];
      const lfParams: unknown[] = [];
      let lfParamIdx = 1;

      for (const { id, slug, entityUuid, fragment } of batch) {
        lfValues.push(
          `($${lfParamIdx}::uuid, $${lfParamIdx + 1}::uuid, $${lfParamIdx + 2}::uuid, NULL, $${lfParamIdx + 3}, $${lfParamIdx + 4}, $${lfParamIdx + 5}, $${lfParamIdx + 6}::text[], now())`
        );
        lfParams.push(
          id,
          entityUuid,
          dummyChronicleId,
          slug,
          fragment.title,
          fragment.prose,
          fragment.tags || []
        );
        lfParamIdx += 7;
      }

      await pool.query(
        `INSERT INTO lore_fragment (id, entity_id, chronicle_id, beat_id, slug, title, prose, tags, created_at)
         VALUES ${lfValues.join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        lfParams
      );

      fragmentCount += batch.length;
      process.stdout.write(`\r  Inserted ${fragmentCount}/${allFragments.length} lore fragments`);
    }
    console.log(`\n✓ Inserted ${fragmentCount} lore fragments`);

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
