ALTER TABLE chronicle_turn
  RENAME COLUMN entity_offered TO entity_roster;

UPDATE chronicle_turn turn_record
SET entity_roster = (
  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'availability', jsonb_build_array('recent'),
    'description', entry -> 'description',
    'id', entry -> 'id',
    'kind', entry -> 'kind',
    'name', entry -> 'name',
    'slug', entry -> 'slug',
    'status', entry -> 'status',
    'subkind', entry -> 'subkind'
  ))), '[]'::jsonb)
  FROM jsonb_array_elements(turn_record.entity_roster) AS entry
)
WHERE jsonb_typeof(entity_roster) = 'array';

UPDATE chronicle
SET props = jsonb_set(
  props,
  '{entityRoster}',
  jsonb_build_object(
    'entries', '[]'::jsonb,
    'locationName', location_name,
    'sceneId', null,
    'updatedAtTurn', 0
  )
)
WHERE NOT props ? 'entityRoster';

ALTER TABLE chronicle_turn
  ADD COLUMN entity_references jsonb;

INSERT INTO app.prompt_template (id, body, updated_at)
VALUES (
  'entity-reference-resolver',
  $prompt$You resolve vague references in one transcript message to established entities supplied as candidates.

Return a match only when the message contains a specific phrase that refers to one candidate. Relevance alone is not a reference. A candidate merely fitting the subject of the message is not enough. If the phrase could refer to several candidates, return no match for it.

For each match, copy the exact referring substring from the message into `text` and return the candidate's exact `slug`. Do not rewrite, normalize, or expand the substring. Return an empty `matches` array when nothing is clear.
$prompt$,
  now()
)
ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, updated_at = EXCLUDED.updated_at;

UPDATE app.prompt_template
SET body = replace(
  replace(
    body,
    'Do not infer usage from the player''s intent alone.',
    'Do not infer usage from the player''s intent alone. A resolved GM entity reference means that entity was at least mentioned.'
  ),
  'Return your answer using the structured format provided. For each entity, provide:',
  'Return your answer using the structured format provided. Return every offered entity exactly once. For each entity, provide:'
),
updated_at = now()
WHERE id = 'entity-judge';
