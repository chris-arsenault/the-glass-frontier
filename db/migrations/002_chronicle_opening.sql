UPDATE chronicle
SET props = jsonb_set(props, '{openingText}', to_jsonb(''::text), true)
WHERE NOT (props ? 'openingText');
