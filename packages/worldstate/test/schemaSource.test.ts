import {
  PromptTemplateIds,
  RELATIONSHIP_TYPES,
  WORLD_KIND_IDS,
  WORLD_PROMINENCE,
  WORLD_SUBKIND_IDS,
} from '@glass-frontier/dto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEMPLATE_DIR } from '../../../scripts/generatePromptTemplateSeed';
import { startHarness, type Harness } from './harness';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const workspacesIn = async (root: string): Promise<string[]> => {
  const entries = await readdir(path.join(REPO_ROOT, root), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => `${root}/${entry.name}`);
};

const migrationsDirIn = async (workspace: string): Promise<string | null> => {
  const contents = await readdir(path.join(REPO_ROOT, workspace));
  return contents.includes('migrations') ? `${workspace}/migrations` : null;
};

/**
 * These tests exist because the repository once carried four migration sets:
 * `db/migrations`, which the deploy applies, and one node-pg-migrate set each
 * under `packages/app`, `packages/ops` and `packages/worldstate`, which only
 * the tests applied. They drifted, and a column added to the tested schema
 * never reached production.
 */
describe('schema source of truth', () => {
  let harness: Harness;
  let pool: Pool;

  beforeAll(async () => {
    harness = await startHarness();
    pool = harness.pool;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('keeps db/migrations the only migrations directory in the repository', async () => {
    const roots = await Promise.all(['packages', 'apps'].map(workspacesIn));
    const found = await Promise.all(roots.flat().map(migrationsDirIn));
    expect(found.filter(Boolean)).toEqual([]);
  });

  it('seeds every prominence tier the DTO declares', async () => {
    const result = await pool.query<{ id: string }>('SELECT id FROM world_prominence');
    expect(result.rows.map((row) => row.id).sort()).toEqual(
      WORLD_PROMINENCE.map((tier) => tier.id).sort()
    );
  });

  it('seeds every entity kind and subkind the DTO declares', async () => {
    const kinds = await pool.query<{ id: string }>('SELECT id FROM world_kind');
    expect(kinds.rows.map((row) => row.id).sort()).toEqual([...WORLD_KIND_IDS].sort());

    const subkinds = await pool.query<{ id: string }>('SELECT DISTINCT id FROM world_subkind');
    expect(subkinds.rows.map((row) => row.id).sort()).toEqual([...WORLD_SUBKIND_IDS].sort());
  });

  it('seeds every relationship type the DTO declares', async () => {
    const result = await pool.query<{ id: string }>('SELECT id FROM world_relationship_kind');
    expect(result.rows.map((row) => row.id).sort()).toEqual(
      RELATIONSHIP_TYPES.map((relationship) => relationship.id).sort()
    );
  });

  /**
   * The same defect the migrations tests guard against, in the prompt bodies:
   * the seed used to carry its own copy of every template, it re-applied on
   * every deploy, and edits to `packages/app/templates` never reached the
   * running prompt. The generated seed is what keeps the two equal, so this
   * asserts equality rather than trusting the generator ran.
   */
  it('seeds the prompt body every template file declares', async () => {
    const stored = await pool.query<{ id: string; body: string }>(
      'SELECT id, body FROM app.prompt_template'
    );
    const bodies = new Map(stored.rows.map((row) => [row.id, row.body]));
    expect([...bodies.keys()].sort()).toEqual([...PromptTemplateIds].sort());

    const authored = await Promise.all(
      PromptTemplateIds.map(async (id) => [
        id,
        (await readFile(path.join(TEMPLATE_DIR, `${id}.hbs`), 'utf8')).trim(),
      ])
    );
    expect(authored.map(([id]) => [id, bodies.get(id)])).toEqual(authored);
  });
});
