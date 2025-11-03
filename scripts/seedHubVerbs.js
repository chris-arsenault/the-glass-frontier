#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { normalizeVerbDefinition } = require("../src/hub/verbCatalog");

async function seed(pool, verbs) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const definition of verbs) {
      const capabilityTags = Array.isArray(definition.capabilities)
        ? definition.capabilities.map((entry) => entry.capabilityId)
        : [];

      const safetyTags = Array.isArray(definition.safetyTags)
        ? definition.safetyTags
        : [];

      const moderationTags = Array.isArray(definition.moderationTags)
        ? definition.moderationTags
        : [];

      await client.query(
        `INSERT INTO hub_verbs (
            hub_id,
            verb_id,
            version,
            definition,
            capability_tags,
            safety_tags,
            moderation_tags,
            status,
            audit_ref,
            created_by,
            updated_by
         )
         VALUES (
            $1,
            $2,
            1,
            $3::jsonb,
            $4::text[],
            $5::text[],
            $6::text[],
            'active',
            $7,
            $8,
            $8
         )
         ON CONFLICT (hub_id, verb_id, version) DO NOTHING`,
        [
          null,
          definition.verbId,
          JSON.stringify(definition),
          capabilityTags.length > 0 ? capabilityTags : null,
          safetyTags.length > 0 ? safetyTags : null,
          moderationTags.length > 0 ? moderationTags : null,
          "bootstrap",
          "system"
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const connectionString =
    process.env.HUB_VERB_DATABASE_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    // eslint-disable-next-line no-console
    console.error("HUB_VERB_DATABASE_URL or DATABASE_URL must be set");
    process.exit(1);
  }

  const catalogPath = path.join(
    __dirname,
    "../src/hub/config/defaultVerbCatalog.json"
  );

  const raw = fs.readFileSync(catalogPath, "utf8");
  const config = JSON.parse(raw);

  if (!config || !Array.isArray(config.verbs)) {
    // eslint-disable-next-line no-console
    console.error("Default verb catalog is missing verbs array");
    process.exit(1);
  }

  const normalized = config.verbs.map((verb) => normalizeVerbDefinition(verb));
  const pool = new Pool({ connectionString });

  try {
    await seed(pool, normalized);
    // eslint-disable-next-line no-console
    console.log(`Seeded ${normalized.length} hub verbs`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to seed hub verbs", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}
