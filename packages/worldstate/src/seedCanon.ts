import type { Pool } from 'pg';

import artifact from './canon/tsonuCanonSnapshot.json' with { type: 'json' };
import { CanonSnapshotWriter } from './canonSnapshotWriter';
import { parseTsonuSnapshot, type TsonuCanonSnapshot } from './tsonuBundle';

/**
 * The canon artifact, generated from tsonu-canon's site bundle by
 * `bin/importTsonuCanon.ts` and checked in. The dedicated seed Lambda imports
 * this module directly, which bundles the artifact without exposing it through
 * the normal worldstate entry point or requiring a runtime filesystem read.
 */
export type CanonSeedResult = {
  batchId: string;
  classificationCount: number;
  encyclopediaCount: number;
  entityCount: number;
  loreCount: number;
  relationshipCount: number;
  sourceId: string;
  status: 'applied' | 'unchanged';
};

type StoredSeedBatch = {
  classification_count: number;
  encyclopedia_count: number;
  entity_count: number;
  id: string;
  lore_count: number;
  relationship_count: number;
};

const requireStableImport = (snapshot: TsonuCanonSnapshot): string => {
  const proposal = snapshot.atlas;
  if (proposal.source !== 'import') {
    throw new Error(
      `The production canon artifact must use source "import", not "${proposal.source}".`
    );
  }
  if (proposal.sourceId === undefined) {
    throw new Error('The production canon artifact must identify its source revision.');
  }
  if (proposal.entities.some((entity) => entity.externalKey === undefined)) {
    throw new Error('Every production canon entity must have a stable external key.');
  }
  if (proposal.lore.some((fragment) => fragment.externalKey === undefined)) {
    throw new Error('Every production canon lore fragment must have a stable external key.');
  }
  if (
    proposal.relationships.some(
      (relationship) => !('externalKey' in relationship.src) || !('externalKey' in relationship.dst)
    )
  ) {
    throw new Error('Every production canon relationship must use stable external keys.');
  }
  if (proposal.sourceId !== snapshot.sourceId) {
    throw new Error('The production canon snapshot and Atlas proposal use different source ids.');
  }
  return snapshot.sourceId;
};

export const loadCanonArtifact = (): TsonuCanonSnapshot => {
  const snapshot = parseTsonuSnapshot(artifact);
  requireStableImport(snapshot);
  return snapshot;
};

const storedSeedBatch = async (
  pool: Pool,
  sourceId: string
): Promise<StoredSeedBatch | undefined> => {
  const result = await pool.query<StoredSeedBatch>(
    `SELECT id, entity_count, relationship_count, lore_count,
       encyclopedia_count, classification_count
     FROM ingest_batch
     WHERE source = 'import' AND source_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [sourceId]
  );
  return result.rows[0];
};

/**
 * Commits the canon artifact. Idempotent by `(source, external_key)`: re-running
 * against a newer artifact updates entities, lore, and edges in place without
 * minting new ids, so chronicle references survive a refresh. Each revision is
 * authoritative: import-owned records omitted from it are removed.
 */
export const seedCanon = async (pool: Pool): Promise<CanonSeedResult> => {
  const snapshot = loadCanonArtifact();
  const sourceId = requireStableImport(snapshot);
  const stored = await storedSeedBatch(pool, sourceId);
  if (stored !== undefined) {
    return {
      batchId: stored.id,
      classificationCount: stored.classification_count,
      encyclopediaCount: stored.encyclopedia_count,
      entityCount: stored.entity_count,
      loreCount: stored.lore_count,
      relationshipCount: stored.relationship_count,
      sourceId,
      status: 'unchanged',
    };
  }

  const committed = await new CanonSnapshotWriter(pool).commit(snapshot);
  return {
    batchId: committed.batchId,
    classificationCount: committed.classificationCount,
    encyclopediaCount: committed.encyclopediaCount,
    entityCount: committed.entityCount,
    loreCount: committed.loreCount,
    relationshipCount: committed.relationshipCount,
    sourceId,
    status: 'applied',
  };
};
