/**
 * Depth-bounded traversal weighted by relationship strength.
 *
 * Every step multiplies the running strength by
 * `COALESCE(edge.strength, world_relationship_kind.default_strength)`, so a path
 * through `leader_of` reaches further than one through `adjacent_to`, and the
 * strongest route to each neighbor wins. Depth is a parameter rather than two
 * hand-written CTE levels, and banned verbs never carry a path.
 *
 * Parameters: `$1` root entity, `$2`/`$3` prominence rank bounds, `$4` kind
 * filter or null, `$5` max hops, `$6` limit.
 */
export const NEIGHBOR_QUERY = `WITH RECURSIVE walk AS (
  SELECT
    CASE WHEN e.src_id = $1::uuid THEN e.dst_id ELSE e.src_id END AS neighbor_id,
    e.type AS root_relationship,
    CASE WHEN e.src_id = $1::uuid THEN 'out' ELSE 'in' END AS root_direction,
    e.type AS relationship,
    CASE WHEN e.src_id = $1::uuid THEN 'out' ELSE 'in' END AS direction,
    NULL::uuid AS via_id,
    1 AS hops,
    COALESCE(e.strength, wrk.default_strength)::real AS reach
  FROM edge e
  JOIN entity root ON root.id = $1::uuid AND NOT root.is_article
  JOIN world_relationship_kind wrk ON wrk.id = e.type AND wrk.category <> 'banned'
  JOIN entity neighbor ON neighbor.id = CASE
    WHEN e.src_id = $1::uuid THEN e.dst_id ELSE e.src_id END
    AND NOT neighbor.is_article
  WHERE (e.src_id = $1::uuid OR e.dst_id = $1::uuid)
    AND COALESCE((e.props ->> 'live')::boolean, true)
  UNION ALL
  SELECT
    CASE WHEN e.src_id = w.neighbor_id THEN e.dst_id ELSE e.src_id END,
    w.root_relationship, w.root_direction,
    e.type,
    CASE WHEN e.src_id = w.neighbor_id THEN 'out' ELSE 'in' END,
    w.neighbor_id,
    w.hops + 1,
    (w.reach * COALESCE(e.strength, wrk.default_strength))::real
  FROM walk w
  JOIN edge e ON e.src_id = w.neighbor_id OR e.dst_id = w.neighbor_id
  JOIN world_relationship_kind wrk ON wrk.id = e.type AND wrk.category <> 'banned'
  JOIN entity next_entity ON next_entity.id = CASE
    WHEN e.src_id = w.neighbor_id THEN e.dst_id ELSE e.src_id END
    AND NOT next_entity.is_article
  WHERE w.hops < $5
    AND COALESCE((e.props ->> 'live')::boolean, true)
    AND CASE WHEN e.src_id = w.neighbor_id THEN e.dst_id ELSE e.src_id END <> $1::uuid
), ranked AS (
  SELECT DISTINCT ON (neighbor_id, root_relationship, root_direction)
    neighbor_id, root_relationship, root_direction, relationship, direction,
    via_id, hops, reach
  FROM walk
  ORDER BY neighbor_id, root_relationship, root_direction, reach DESC, hops ASC
)
SELECT r.neighbor_id, r.root_relationship, r.root_direction, r.relationship,
  r.direction, r.via_id, r.hops, e.id, e.slug, e.kind, e.subkind,
  e.name, e.description, e.status, e.prominence, e.props, e.external_key, e.dm,
  e.is_article, e.is_location, e.origin_blurb, e.playable_as, e.veiled, e.veil_tagline,
  e.created_at, e.updated_at
FROM ranked r
JOIN entity e ON e.id = r.neighbor_id
JOIN world_prominence wp ON wp.id = e.prominence
WHERE wp.rank BETWEEN $2 AND $3
  AND ($4::text IS NULL OR e.kind = $4)
ORDER BY r.reach DESC, r.hops ASC, e.created_at ASC
LIMIT $6`;
