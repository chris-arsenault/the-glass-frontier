import { randomUUID } from 'node:crypto';

import type { Character, Chronicle, HardState, Player } from '@glass-frontier/dto';
import { createChronicleStore, createWorldSchemaStore } from '@glass-frontier/worldstate';
import { log } from '@glass-frontier/utils';

export const PLAYWRIGHT_PLAYER_ID = 'playwright-e2e';
export const PLAYWRIGHT_CHARACTER_ID = '11111111-2222-4333-8444-555555555555';
export const PLAYWRIGHT_CHRONICLE_ID = 'aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeeee';

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

const BASE_CHRONICLE: Chronicle = {
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
    id: randomUUID(),
    slug: 'glass_wardens',
    kind: 'faction',
    name: 'Glass Wardens',
    subkind: 'order',
    status: 'active',
    prominence: 'renowned',
  },
  {
    id: randomUUID(),
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
export const buildPlaywrightChronicleRecord = (options?: { locationId?: string }): Chronicle => ({
  ...BASE_CHRONICLE,
  locationId: options?.locationId ?? BASE_CHRONICLE.locationId,
});

export async function seedPlaywrightFixtures(connectionString: string): Promise<{ location: HardState }> {
  const worldSchemaStore = createWorldSchemaStore({ connectionString });
  const chronicleStore = createChronicleStore({ connectionString, worldStore: worldSchemaStore });

  await chronicleStore.deleteChronicle(PLAYWRIGHT_CHRONICLE_ID).catch(() => undefined);

  const player = buildPlaywrightPlayerRecord();
  const character = buildPlaywrightCharacterRecord();
  const chronicle = buildPlaywrightChronicleRecord();

  const location = await worldSchemaStore.upsertEntity(LOCATION_ROOT);

  const warden = await worldSchemaStore.upsertEntity(NON_LOCATION_ENTITIES[0]);
  const relic = await worldSchemaStore.upsertEntity(NON_LOCATION_ENTITIES[1]);

  await worldSchemaStore.createLoreFragment({
    entityId: warden.id,
    source: { chronicleId: undefined },
    title: 'Founding Oath',
    prose: 'The Glass Wardens swear to shield all archives from oblivion.',
    tags: ['faction', 'oath', 'founding'],
  });
  await worldSchemaStore.createLoreFragment({
    entityId: relic.id,
    source: { chronicleId: undefined },
    title: 'Oracle Signal',
    prose: 'When attuned, the vessel whispers coordinates to hidden gates.',
    tags: ['artifact', 'oracle'],
  });

  await chronicleStore.upsertCharacter(character);
  await chronicleStore.upsertChronicle(chronicle);

  return { location };
}

export async function resetPlaywrightFixtures(connectionString: string): Promise<void> {
  await seedPlaywrightFixtures(connectionString);
  log('info', 'playwright fixtures reset');
}
