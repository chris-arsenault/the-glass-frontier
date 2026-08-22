import { CanonProposal, type CommitBatchResult } from '@glass-frontier/dto';
import type { Pool } from 'pg';

import artifact from './canon/tsonuCanonProposal.json' with { type: 'json' };
import { CanonWriter } from './canonWriter';

/**
 * The canon artifact, generated from tsonu-canon's site bundle by
 * `bin/importTsonuCanon.ts` and checked in. The dedicated seed Lambda imports
 * this module directly, which bundles the artifact without exposing it through
 * the normal worldstate entry point or requiring a runtime filesystem read.
 */
export type CanonSeedResult = Omit<CommitBatchResult, 'entityIdsByRef'> & {
  sourceId: string;
  status: 'applied' | 'unchanged';
};

type StoredSeedBatch = {
  entity_count: number;
  id: string;
  lore_count: number;
  relationship_count: number;
};

const requireStableImport = (proposal: CanonProposal): string => {
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
  return proposal.sourceId;
};

export const loadCanonArtifact = (): CanonProposal => {
  const proposal = CanonProposal.parse(artifact);
  requireStableImport(proposal);
  return proposal;
};

const storedSeedBatch = async (
  pool: Pool,
  sourceId: string
): Promise<StoredSeedBatch | undefined> => {
  const result = await pool.query<StoredSeedBatch>(
    `SELECT id, entity_count, relationship_count, lore_count
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
 * minting new ids, so chronicle references survive a refresh. Entries removed
 * from the source are not deleted here.
 */
export const seedCanon = async (pool: Pool): Promise<CanonSeedResult> => {
  const proposal = loadCanonArtifact();
  const sourceId = requireStableImport(proposal);
  const stored = await storedSeedBatch(pool, sourceId);
  if (stored !== undefined) {
    return {
      batchId: stored.id,
      entityCount: stored.entity_count,
      loreCount: stored.lore_count,
      relationshipCount: stored.relationship_count,
      sourceId,
      status: 'unchanged',
    };
  }

  const committed = await new CanonWriter(pool).commitBatch(proposal);
  return {
    batchId: committed.batchId,
    entityCount: committed.entityCount,
    loreCount: committed.loreCount,
    relationshipCount: committed.relationshipCount,
    sourceId,
    status: 'applied',
  };
};
