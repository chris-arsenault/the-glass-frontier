import { relationshipDefaultStrength, type CanonProposal } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

import { relationshipPropsJson } from './canonProps';
import { refKey } from './canonValidation';
import { RELATIONSHIP_UPSERT_SQL } from './canonWriterSql';

export type RelationshipWrite = {
  dst: string;
  props: string;
  src: string;
  strength: number;
  type: string;
};

export const planRelationshipWrites = (
  proposal: CanonProposal,
  resolved: Map<string, string>
): RelationshipWrite[] =>
  proposal.relationships.map((relationship) => {
    const src = resolved.get(refKey(relationship.src));
    const dst = resolved.get(refKey(relationship.dst));
    if (src === undefined || dst === undefined) {
      throw new Error('Relationship endpoint went unresolved after validation');
    }
    return {
      dst,
      props: relationshipPropsJson(relationship),
      src,
      strength: relationship.strength ?? relationshipDefaultStrength(relationship.relationship),
      type: relationship.relationship,
    };
  });

export const insertRelationships = async (
  client: PoolClient,
  writes: RelationshipWrite[],
  proposal: CanonProposal,
  batchId: string
): Promise<void> => {
  if (writes.length === 0) {
    return;
  }
  await client.query(RELATIONSHIP_UPSERT_SQL, [
    writes.map(() => randomUUID()),
    writes.map((write) => write.src),
    writes.map((write) => write.dst),
    writes.map((write) => write.type),
    writes.map((write) => write.strength),
    proposal.source,
    proposal.sourceId ?? null,
    batchId,
    writes.map((write) => write.props),
  ]);
};
