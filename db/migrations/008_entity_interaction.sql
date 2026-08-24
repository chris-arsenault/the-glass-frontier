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

-- The entity-reference-resolver template and the entity-judge wording this
-- migration once wrote by hand now arrive with every other prompt body, from
-- the generated seed that packages/app/templates is the source of.
