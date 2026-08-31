import type { Character } from '@glass-frontier/dto';
import type { PoolClient } from 'pg';

import { upsertNodeIdentity } from './nodeIdentity';
import { serializeJson } from './utils';

/**
 * The character row. `props` carries the whole character and is what reads go
 * through; the scalar columns mirror it so canon ids, callings and the rest are
 * queryable without unpacking JSON.
 */
const UPSERT_CHARACTER = `
  INSERT INTO character (
    id, player_id, name, tags, archetype, pronouns, bio,
    attributes, skills, inventory, momentum, props,
    species_reference_id, culture_reference_id, homeland_id, allegiance_id, allegiance_stance,
    callings, drive, flaw, instinct, unique_thing, created_at, updated_at
  ) VALUES (
    $1::uuid, $2, $3, $4::text[], $5, $6, $7,
    $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb,
    $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17,
    $18::text[], $19, $20, $21, $22, now(), now()
  ) ON CONFLICT (id) DO UPDATE SET
    player_id = EXCLUDED.player_id, name = EXCLUDED.name,
    tags = EXCLUDED.tags, archetype = EXCLUDED.archetype,
    pronouns = EXCLUDED.pronouns, bio = EXCLUDED.bio,
    attributes = EXCLUDED.attributes, skills = EXCLUDED.skills,
    inventory = EXCLUDED.inventory, momentum = EXCLUDED.momentum,
    props = EXCLUDED.props,
    species_reference_id = EXCLUDED.species_reference_id,
    culture_reference_id = EXCLUDED.culture_reference_id,
    homeland_id = EXCLUDED.homeland_id, allegiance_id = EXCLUDED.allegiance_id,
    allegiance_stance = EXCLUDED.allegiance_stance, callings = EXCLUDED.callings,
    drive = EXCLUDED.drive, flaw = EXCLUDED.flaw, instinct = EXCLUDED.instinct,
    unique_thing = EXCLUDED.unique_thing, updated_at = now()`;

const characterValues = (character: Character): unknown[] => [
  character.id,
  character.playerId,
  character.name,
  character.tags,
  character.archetype,
  character.pronouns,
  character.bio,
  serializeJson(character.attributes),
  serializeJson(character.skills),
  serializeJson(character.inventory),
  serializeJson(character.momentum),
  serializeJson(character),
  character.origin.speciesReferenceId,
  character.origin.cultureReferenceId,
  character.origin.homelandId,
  character.origin.allegianceId,
  character.origin.allegianceStance,
  character.nature.callings,
  character.nature.drive ?? null,
  character.nature.flaw ?? null,
  character.nature.instinct ?? null,
  character.nature.uniqueThing ?? null,
];

export async function persistCharacter(
  client: PoolClient,
  character: Character
): Promise<void> {
  await upsertNodeIdentity(client, character.id, 'character');
  await client.query(UPSERT_CHARACTER, characterValues(character));
}
