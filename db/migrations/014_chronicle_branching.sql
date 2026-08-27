-- A character is one shared record. Move the most recently played session
-- state into that record before removing the per-chronicle JSON copies.
WITH latest_character_state AS (
  SELECT DISTINCT ON (chronicle.primary_char_id)
    chronicle.primary_char_id AS character_id,
    session.character_state
  FROM chronicle_session_state session
  JOIN chronicle ON chronicle.id = session.chronicle_id
  WHERE chronicle.primary_char_id IS NOT NULL
    AND session.character_state IS NOT NULL
  ORDER BY chronicle.primary_char_id, session.updated_at DESC
)
UPDATE character
SET
  skills = COALESCE(latest.character_state -> 'skills', character.skills),
  inventory = COALESCE(latest.character_state -> 'inventory', character.inventory),
  momentum = COALESCE(latest.character_state -> 'momentum', character.momentum),
  props = jsonb_set(
    jsonb_set(
      jsonb_set(
        character.props,
        '{skills}',
        COALESCE(latest.character_state -> 'skills', character.props -> 'skills')
      ),
      '{inventory}',
      COALESCE(latest.character_state -> 'inventory', character.props -> 'inventory')
    ),
    '{momentum}',
    COALESCE(latest.character_state -> 'momentum', character.props -> 'momentum')
  ),
  updated_at = now()
FROM latest_character_state latest
WHERE character.id = latest.character_id;

-- Every new turn records the chronicle state after that turn. Existing
-- chronicles can branch from their current tip; earlier historical turns did
-- not contain enough state to reconstruct an exact checkpoint.
ALTER TABLE chronicle_turn
  ADD COLUMN chronicle_state jsonb;

WITH latest_turn AS (
  SELECT chronicle_id, MAX(turn_sequence) AS turn_sequence
  FROM chronicle_turn
  GROUP BY chronicle_id
)
UPDATE chronicle_turn turn_record
SET chronicle_state = chronicle.props
FROM latest_turn, chronicle
WHERE turn_record.chronicle_id = latest_turn.chronicle_id
  AND turn_record.turn_sequence = latest_turn.turn_sequence
  AND chronicle.id = turn_record.chronicle_id;

ALTER TABLE chronicle_session_state
  DROP COLUMN character_state;
