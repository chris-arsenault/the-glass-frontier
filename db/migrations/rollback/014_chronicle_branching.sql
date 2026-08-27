ALTER TABLE chronicle_session_state
  ADD COLUMN character_state jsonb;

UPDATE chronicle_session_state session
SET character_state = character.props
FROM chronicle
JOIN character ON character.id = chronicle.primary_char_id
WHERE chronicle.id = session.chronicle_id;

ALTER TABLE chronicle_turn
  DROP COLUMN IF EXISTS chronicle_state;
