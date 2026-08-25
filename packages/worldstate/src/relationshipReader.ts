import type { LiveRelationship } from '@glass-frontier/dto';
import type { Pool } from 'pg';

import { linkProps, type LinkRow } from './entityReader';

/**
 * Every live canonical relationship among the given entity set — the batched
 * relationship read for scene context. Both endpoints must be in the set, the
 * edge must be live, and banned and DM relation categories never return. The
 * caller supplies an already audience-filtered entity set.
 */
const RELATIONSHIPS_AMONG_QUERY = `SELECT e.src_id, e.dst_id, e.type, e.strength, e.props
  FROM edge e
  JOIN world_relationship_kind wrk ON wrk.id = e.type
    AND wrk.category NOT IN ('banned', 'dm')
  WHERE e.src_id = ANY($1::uuid[])
    AND e.dst_id = ANY($1::uuid[])
    AND COALESCE((e.props ->> 'live')::boolean, true)`;

export class RelationshipReader {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async listRelationshipsAmong(input: { entityIds: string[] }): Promise<LiveRelationship[]> {
    if (input.entityIds.length === 0) {
      return [];
    }
    const result = await this.#pool.query<LinkRow>(RELATIONSHIPS_AMONG_QUERY, [input.entityIds]);
    return result.rows.map((row) => ({
      descriptiveIdentity: row.props?.descriptiveIdentity,
      dstId: row.dst_id,
      identityLocal: row.props?.identityLocal,
      identityProvenance: row.props?.identityProvenance,
      identitySources: row.props?.identitySources,
      props: linkProps(row),
      relationship: row.type,
      since: row.props?.since,
      srcId: row.src_id,
      strength: row.strength ?? undefined,
      until: row.props?.until,
    }));
  }
}
