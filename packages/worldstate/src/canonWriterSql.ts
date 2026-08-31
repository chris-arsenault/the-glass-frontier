export const CANON_WRITE_LOCK_SQL = `SELECT pg_advisory_xact_lock(
  hashtext('glass-frontier:canon-writer')
)`;

export const ENTITY_UPSERT_SQL = `INSERT INTO entity
  (id, slug, kind, subkind, name, description, prominence, status, props, is_location,
   is_article, playable_as, origin_blurb, veiled, veil_tagline, dm,
   context_tags, source, source_id, external_key, batch_id, created_at, updated_at)
  SELECT id, slug, kind, subkind, name, description, prominence, status, props::jsonb, is_location,
    is_article, ARRAY(SELECT jsonb_array_elements_text(playable_as_json)), origin_blurb,
    veiled, veil_tagline, dm, ARRAY(SELECT jsonb_array_elements_text(context_tags_json)),
    $9, $10, external_key, $11::uuid, now(), now()
  FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[],
    $6::text[], $7::text[], $8::text[], $12::text[], $13::text[], $14::boolean[],
    $15::boolean[], $16::jsonb[], $17::text[], $18::boolean[], $19::text[], $20::boolean[],
    $21::jsonb[])
    AS t(id, slug, kind, subkind, name, description, prominence, status, external_key, props,
      is_location, is_article, playable_as_json, origin_blurb, veiled, veil_tagline, dm,
      context_tags_json)
  ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, kind = EXCLUDED.kind,
    subkind = EXCLUDED.subkind, name = EXCLUDED.name,
    description = EXCLUDED.description, prominence = EXCLUDED.prominence,
    status = EXCLUDED.status, props = EXCLUDED.props,
    is_location = EXCLUDED.is_location, is_article = EXCLUDED.is_article,
    playable_as = EXCLUDED.playable_as, origin_blurb = EXCLUDED.origin_blurb,
    veiled = EXCLUDED.veiled, veil_tagline = EXCLUDED.veil_tagline,
    dm = EXCLUDED.dm, context_tags = EXCLUDED.context_tags, source = EXCLUDED.source,
    source_id = EXCLUDED.source_id, external_key = EXCLUDED.external_key,
    batch_id = EXCLUDED.batch_id,
    embedding = CASE
      WHEN (entity.name, entity.kind, entity.description)
        IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.kind, EXCLUDED.description)
      THEN NULL
      ELSE entity.embedding
    END,
    embedding_model = CASE
      WHEN (entity.name, entity.kind, entity.description)
        IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.kind, EXCLUDED.description)
      THEN NULL
      ELSE entity.embedding_model
    END,
    embedding_updated_at = CASE
      WHEN (entity.name, entity.kind, entity.description)
        IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.kind, EXCLUDED.description)
      THEN NULL
      ELSE entity.embedding_updated_at
    END,
    updated_at = now()
  WHERE entity.source = EXCLUDED.source
    AND (entity.slug, entity.kind, entity.subkind, entity.name, entity.description,
      entity.prominence, entity.status, entity.props, entity.is_location, entity.is_article,
      entity.playable_as, entity.origin_blurb, entity.veiled, entity.veil_tagline, entity.dm,
      entity.context_tags, entity.external_key)
    IS DISTINCT FROM
      (EXCLUDED.slug, EXCLUDED.kind, EXCLUDED.subkind, EXCLUDED.name,
       EXCLUDED.description, EXCLUDED.prominence, EXCLUDED.status,
       EXCLUDED.props, EXCLUDED.is_location, EXCLUDED.is_article, EXCLUDED.playable_as,
       EXCLUDED.origin_blurb, EXCLUDED.veiled, EXCLUDED.veil_tagline, EXCLUDED.dm,
       EXCLUDED.context_tags, EXCLUDED.external_key)`;

export const RELATIONSHIP_UPSERT_SQL = `INSERT INTO edge
  (id, src_id, dst_id, type, props, strength, source, source_id, batch_id, created_at)
  SELECT id, src_id, dst_id, type, props::jsonb, strength, $6, $7, $8::uuid, now()
  FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::real[], $9::text[])
    AS t(id, src_id, dst_id, type, strength, props)
  ON CONFLICT (src_id, dst_id, type) DO UPDATE SET strength = EXCLUDED.strength,
    props = EXCLUDED.props, source = EXCLUDED.source, source_id = EXCLUDED.source_id,
    batch_id = EXCLUDED.batch_id
  WHERE (
    edge.source = EXCLUDED.source
    AND (edge.strength, edge.props) IS DISTINCT FROM (EXCLUDED.strength, EXCLUDED.props)
  ) OR (
    edge.source <> EXCLUDED.source
    AND (
      EXCLUDED.source = 'author'
      OR (EXCLUDED.source = 'play' AND edge.source IN ('import', 'seed'))
    )
  )`;
