import { createAppStore } from '@glass-frontier/app';
import type { Character, Chronicle, HardState, Player } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import { createChronicleStore, createWorldSchemaStore } from '@glass-frontier/worldstate';

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

const LOCATION_ROOT_ID = '99999999-8888-4777-8666-555555555555';

const BASE_CHRONICLE: Chronicle = {
  anchorEntityId: GLASS_WARDENS_ID,
  beats: [],
  beatsEnabled: true,
  characterId: PLAYWRIGHT_CHARACTER_ID,
  entityFocus: { entityScores: {}, tagScores: {} },
  id: PLAYWRIGHT_CHRONICLE_ID,
  locationId: LOCATION_ROOT_ID,
  locationName: 'Luminous Quay',
  playerId: PLAYWRIGHT_PLAYER_ID,
  status: 'open',
  summaries: [],
  title: 'Playwright Chronicle',
  toneChips: [],
  toneNotes: '',
};

const LOCATION_ROOT: Omit<HardState, 'createdAt' | 'updatedAt' | 'links'> = {
  facts: { population: 'a few hundred keepers and dockhands' },
  id: LOCATION_ROOT_ID,
  kind: 'installation',
  name: 'Luminous Quay',
  prominence: 'recognized',
  slug: 'luminous_quay',
  status: 'active',
  subkind: 'settlement',
};

const NON_LOCATION_ENTITIES: Array<Omit<HardState, 'createdAt' | 'updatedAt' | 'links'>> = [
  {
    facts: { founded: 2101 },
    id: GLASS_WARDENS_ID,
    kind: 'faction',
    name: 'Glass Wardens',
    prominence: 'renowned',
    slug: 'glass_wardens',
    status: 'active',
    subkind: 'religious_order',
  },
  {
    facts: { function: 'whispers coordinates to hidden gates when attuned' },
    id: ORACLE_VESSEL_ID,
    kind: 'artifact',
    name: 'Oracle Vessel',
    prominence: 'mythic',
    slug: 'oracle_vessel',
    status: 'intact',
    subkind: 'relic',
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

  // The fixture world is a seed batch like any other, with pinned ids so tests
  // can reference the entities they assert on.
  await worldSchemaStore.commitBatch({
    entities: [
      { ...LOCATION_ROOT, ref: 'location' },
      { ...NON_LOCATION_ENTITIES[0], ref: 'warden' },
      { ...NON_LOCATION_ENTITIES[1], ref: 'relic' },
    ],
    lore: [
      {
        entity: { ref: 'warden' },
        id: FOUNDING_OATH_FRAGMENT_ID,
        prose: 'The Glass Wardens swear to shield all archives from oblivion.',
        tags: ['founding', 'archives', 'religion'],
        title: 'Founding Oath',
      },
      {
        entity: { ref: 'relic' },
        id: ORACLE_SIGNAL_FRAGMENT_ID,
        prose: 'When attuned, the vessel whispers coordinates to hidden gates.',
        tags: ['resonance', 'navigation', 'mystery'],
        title: 'Oracle Signal',
      },
    ],
    relationships: [
      { dst: { ref: 'location' }, relationship: 'governs', src: { ref: 'warden' } },
      { dst: { ref: 'location' }, relationship: 'located_in', since: 2140, src: { ref: 'relic' } },
    ],
    source: 'seed',
    sourceId: 'playwright-fixtures',
  });

  const location = await worldSchemaStore.getEntity({ id: LOCATION_ROOT.id });
  if (location === null) {
    throw new Error('Playwright fixture location was not committed');
  }
  return { location };
}

export async function resetPlaywrightFixtures(connectionString: string): Promise<void> {
  const appStore = createAppStore({ connectionString });
  const chronicleStore = createChronicleStore({ connectionString });

  const existingChronicles = await chronicleStore.listChroniclesByPlayer(PLAYWRIGHT_PLAYER_ID);
  await Promise.all(
    existingChronicles.map((chronicle) => chronicleStore.deleteChronicle(chronicle.id))
  );
  await appStore.playerStore.upsert(buildPlaywrightPlayerRecord());
  await chronicleStore.upsertCharacter(buildPlaywrightCharacterRecord());
  await seedPlaywrightFixtures(connectionString);
  await chronicleStore.upsertChronicle(buildPlaywrightChronicleRecord());
  await Promise.all([
    appStore.modelConfigStore.setCategoryModel(
      'classification',
      'gpt-5.6-luna',
      PLAYWRIGHT_PLAYER_ID
    ),
    appStore.modelConfigStore.setCategoryModel('prose', 'gpt-5.6-luna', PLAYWRIGHT_PLAYER_ID),
  ]);
  log('info', 'playwright fixtures reset');
}
