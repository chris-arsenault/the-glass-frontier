ALTER TABLE chronicle_turn
  DROP COLUMN IF EXISTS entity_references;

DELETE FROM app.prompt_template WHERE id = 'entity-reference-resolver';

UPDATE chronicle
SET props = props - 'entityRoster';

UPDATE app.prompt_template
SET body = replace(
  replace(
    body,
    'Do not infer usage from the player''s intent alone. A resolved GM entity reference means that entity was at least mentioned.',
    'Do not infer usage from the player''s intent alone.'
  ),
  'Return your answer using the structured format provided. Return every offered entity exactly once. For each entity, provide:',
  'Return your answer using the structured format provided. For each entity, provide:'
),
updated_at = now()
WHERE id = 'entity-judge';

ALTER TABLE chronicle_turn
  RENAME COLUMN entity_roster TO entity_offered;
