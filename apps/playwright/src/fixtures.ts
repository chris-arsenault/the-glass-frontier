import { randomUUID } from 'node:crypto';

import type { Character, Chronicle, HardState, Player } from '@glass-frontier/dto';
import { createChronicleStore, createWorldSchemaStore } from '@glass-frontier/worldstate';
import { log } from '@glass-frontier/utils';

export const PLAYWRIGHT_PLAYER_ID = 'playwright-e2e';
export const PLAYWRIGHT_CHARACTER_ID = '11111111-2222-4333-8444-555555555555';
export const PLAYWRIGHT_CHRONICLE_ID = 'aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeeee';
export const PLAYWRIGHT_FOUNDING_OATH_FRAGMENT_ID = '66666666-5555-4444-8333-222222222222';

const BASE_PLAYER: Player = {
  email: 'playwright@example.com',
  id: PLAYWRIGHT_PLAYER_ID,
  metadata: undefined,
  preferences: undefined,
  templateOverrides: {},
  username: PLAYWRIGHT_PLAYER_ID,
};

const BASE_CHARACTER: Character = {
  archetype: 'Recon',
  attributes: {
    attunement: 'standard',
    finesse: 'standard',
    focus: 'standard',
    ingenuity: 'standard',
    presence: 'standard',
    resolve: 'standard',
    vitality: 'standard',
  },
  bio: 'Seeded character for Playwright tests.',
  id: PLAYWRIGHT_CHARACTER_ID,
  inventory: [],
  momentum: { ceiling: 3, current: 0, floor: -2 },
  name: 'E2E Scout',
  playerId: PLAYWRIGHT_PLAYER_ID,
  pronouns: 'they/them',
  skills: {
    navigation: { attribute: 'focus', name: 'navigation', tier: 'apprentice', xp: 0 },
  },
  tags: ['playwright'],
};

// Use fixed UUIDs for non-location entities so they can be referenced consistently
const GLASS_WARDENS_ID = '88888888-7777-4666-8555-444444444444';
const ORACLE_VESSEL_ID = '77777777-6666-4555-8444-333333333333';
const FOUNDING_OATH_FRAGMENT_ID = PLAYWRIGHT_FOUNDING_OATH_FRAGMENT_ID;
const ORACLE_SIGNAL_FRAGMENT_ID = '55555555-4444-4333-8222-111111111111';

const BASE_CHRONICLE: Chronicle = {
  anchorEntityId: GLASS_WARDENS_ID,
  beats: [],
  beatsEnabled: true,
  characterId: PLAYWRIGHT_CHARACTER_ID,
  id: PLAYWRIGHT_CHRONICLE_ID,
  locationId: '99999999-8888-4777-8666-555555555555',
  playerId: PLAYWRIGHT_PLAYER_ID,
  status: 'open',
  summaries: [],
  title: 'Playwright Chronicle',
};

const LOCATION_ROOT: Omit<HardState, 'createdAt' | 'updatedAt' | 'links'> = {
  id: BASE_CHRONICLE.locationId,
  slug: 'luminous_quay',
  kind: 'location',
  name: 'Luminous Quay',
  subkind: 'region',
  status: 'known',
  prominence: 'recognized',
};

const NON_LOCATION_ENTITIES: Array<Omit<HardState, 'createdAt' | 'updatedAt' | 'links'>> = [
  {
    id: GLASS_WARDENS_ID,
    slug: 'glass_wardens',
    kind: 'faction',
    name: 'Glass Wardens',
    subkind: 'order',
    status: 'active',
    prominence: 'renowned',
  },
  {
    id: ORACLE_VESSEL_ID,
    slug: 'oracle_vessel',
    kind: 'artifact',
    name: 'Oracle Vessel',
    subkind: 'relic',
    status: 'intact',
    prominence: 'mythic',
  },
];

export const buildPlaywrightPlayerRecord = (): Player => ({ ...BASE_PLAYER });
export const buildPlaywrightCharacterRecord = (): Character => ({ ...BASE_CHARACTER });
export const buildPlaywrightChronicleRecord = (options?: {
  locationId?: string;
  anchorEntityId?: string;
}): Chronicle => ({
  ...BASE_CHRONICLE,
  anchorEntityId: options?.anchorEntityId ?? BASE_CHRONICLE.anchorEntityId,
  locationId: options?.locationId ?? BASE_CHRONICLE.locationId,
});

export async function seedPlaywrightFixtures(connectionString: string): Promise<{ location: HardState }> {
  const worldSchemaStore = createWorldSchemaStore({ connectionString });

  // Create world entities (location, faction, artifact)
  const location = await worldSchemaStore.upsertEntity(LOCATION_ROOT);

  const warden = await worldSchemaStore.upsertEntity(NON_LOCATION_ENTITIES[0]);
  const relic = await worldSchemaStore.upsertEntity(NON_LOCATION_ENTITIES[1]);

  // Create lore fragments for world entities
  await worldSchemaStore.createLoreFragment({
    id: FOUNDING_OATH_FRAGMENT_ID,
    slug: 'frag_founding_oath_66666666',
    entityId: warden.id,
    source: { chronicleId: undefined },
    title: 'Founding Oath',
    prose: 'The Glass Wardens swear to shield all archives from oblivion.',
    tags: ['faction', 'oath', 'founding'],
  });
  await worldSchemaStore.createLoreFragment({
    id: ORACLE_SIGNAL_FRAGMENT_ID,
    entityId: relic.id,
    source: { chronicleId: undefined },
    title: 'Oracle Signal',
    prose: 'When attuned, the vessel whispers coordinates to hidden gates.',
    tags: ['artifact', 'oracle'],
  });

  return { location };
}

export async function resetPlaywrightFixtures(connectionString: string): Promise<void> {
  await seedPlaywrightFixtures(connectionString);
  log('info', 'playwright fixtures reset');
}
