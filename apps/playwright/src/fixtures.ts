import { createAppStore } from '@glass-frontier/app';
import type { Character, Chronicle, HardState, Player } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import {
  createChronicleStore,
  createWorldSchemaStore,
  type WorldSchemaStore,
} from '@glass-frontier/worldstate';

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

// Use fixed UUIDs for non-location entities so they can be referenced consistently
const GLASS_WARDENS_ID = '88888888-7777-4666-8555-444444444444';
const ORACLE_VESSEL_ID = '77777777-6666-4555-8444-333333333333';
const SITHARIAN_SPECIES_ID = '44444444-3333-4222-8111-000000000000';
const QUAY_CULTURE_ID = '33333333-2222-4111-8000-999999999999';
const FOUNDING_OATH_FRAGMENT_ID = PLAYWRIGHT_FOUNDING_OATH_FRAGMENT_ID;
const ORACLE_SIGNAL_FRAGMENT_ID = '55555555-4444-4333-8222-111111111111';
const RECENT_SIGNAL_FRAGMENT_ID = '22222222-1111-4000-8fff-888888888888';

const LOCATION_ROOT_ID = '99999999-8888-4777-8666-555555555555';

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
  nature: {
    callings: ['Chart the drowned wing before the Wardens seal it', 'Buy back a sold name'],
    drive: 'Prove the quay was never as safe as its keepers claim',
    flaw: 'Cannot leave a sealed door alone',
    instinct: 'When a room goes quiet, they put their back to the nearest wall',
    uniqueThing: 'The only living person the Oracle Vessel has spoken a name to',
  },
  origin: {
    allegianceId: GLASS_WARDENS_ID,
    allegianceStance: 'estranged',
    cultureId: QUAY_CULTURE_ID,
    homelandId: LOCATION_ROOT_ID,
    speciesId: SITHARIAN_SPECIES_ID,
  },
  playerId: PLAYWRIGHT_PLAYER_ID,
  pronouns: 'they/them',
  skills: {
    cut_fouled_lines: {
      attribute: 'finesse',
      name: 'cut fouled lines',
      tier: 'apprentice',
      xp: 0,
    },
    read_fault_bands: {
      attribute: 'focus',
      name: 'read fault bands',
      tier: 'artisan',
      xp: 0,
    },
    talk_down_dock_crowds: {
      attribute: 'presence',
      name: 'talk down dock crowds',
      tier: 'apprentice',
      xp: 0,
    },
  },
  tags: ['playwright'],
};

const BASE_CHRONICLE: Chronicle = {
  activeScene: null,
  anchorEntityId: GLASS_WARDENS_ID,
  beats: [],
  characterId: PLAYWRIGHT_CHARACTER_ID,
  entityFocus: { entityScores: {}, tagScores: {} },
  entityRoster: {
    entries: [],
    locationName: 'Luminous Quay',
    sceneId: null,
    updatedAtTurn: 0,
  },
  id: PLAYWRIGHT_CHRONICLE_ID,
  locationId: LOCATION_ROOT_ID,
  locationName: 'Luminous Quay',
  openingText: 'You stand beneath the signal gantries of Luminous Quay as the next alarm begins.',
  playerId: PLAYWRIGHT_PLAYER_ID,
  sceneLedger: null,
  status: 'open',
  summaries: [],
  title: 'Playwright Chronicle',
  toneChips: [],
  toneNotes: '',
};

const LOCATION_ROOT: Omit<HardState, 'createdAt' | 'updatedAt' | 'links'> = {
  dm: false,
  facts: { population: 'a few hundred keepers and dockhands' },
  id: LOCATION_ROOT_ID,
  isArticle: false,
  isLocation: true,
  kind: 'installation',
  name: 'Luminous Quay',
  originBlurb: 'Raised among the keepers and dockhands of Luminous Quay.',
  playableAs: ['chronicle_location', 'homeland'],
  positions: [],
  prominence: 'recognized',
  slug: 'luminous_quay',
  status: 'active',
  subkind: 'settlement',
  veiled: false,
};

const NON_LOCATION_ENTITIES: Array<Omit<HardState, 'createdAt' | 'updatedAt' | 'links'>> = [
  {
    dm: false,
    facts: { founded: 2101 },
    id: GLASS_WARDENS_ID,
    isArticle: false,
    isLocation: false,
    kind: 'faction',
    name: 'Glass Wardens',
    originBlurb: 'Bound to the Glass Wardens by service, debt, or a broken oath.',
    playableAs: ['allegiance'],
    positions: [],
    prominence: 'renowned',
    slug: 'glass_wardens',
    status: 'active',
    subkind: 'religious_order',
    veiled: false,
  },
  {
    dm: false,
    facts: { function: 'whispers coordinates to hidden gates when attuned' },
    id: ORACLE_VESSEL_ID,
    isArticle: false,
    isLocation: false,
    kind: 'artifact',
    name: 'Oracle Vessel',
    playableAs: [],
    positions: [],
    prominence: 'mythic',
    slug: 'oracle_vessel',
    status: 'intact',
    subkind: 'relic',
    veiled: false,
  },
  {
    dm: false,
    facts: { lifespan: 'roughly two hundred years' },
    id: SITHARIAN_SPECIES_ID,
    isArticle: false,
    isLocation: false,
    kind: 'species',
    name: 'Sitharian',
    originBlurb: 'A long-lived Sitharian attuned to the system through inherited resonance.',
    playableAs: ['species'],
    positions: [],
    prominence: 'recognized',
    slug: 'sitharian',
    status: 'extant',
    veiled: false,
  },
  {
    dm: false,
    facts: { naming: 'given name, then the quay a family keeps' },
    id: QUAY_CULTURE_ID,
    isArticle: false,
    isLocation: false,
    kind: 'culture',
    name: 'Quay-Keeper',
    originBlurb: 'Raised to keep the quay, its names, and the people who depend on it.',
    playableAs: ['culture'],
    positions: [],
    prominence: 'recognized',
    slug: 'quay_keeper',
    status: 'living',
    veiled: false,
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

const seedRecentPlaywrightLore = async (worldSchemaStore: WorldSchemaStore): Promise<void> => {
  await worldSchemaStore.commitBatch({
    entities: [],
    lore: [
      {
        entity: { id: ORACLE_VESSEL_ID },
        id: RECENT_SIGNAL_FRAGMENT_ID,
        prose: 'A newly recorded signal points beyond the charted gates.',
        tags: ['navigation', 'mystery'],
        title: 'Fresh Signal',
      },
    ],
    relationships: [],
    source: 'seed',
    sourceId: 'playwright-recent-lore',
  });
};

export async function seedPlaywrightFixtures(connectionString: string): Promise<{ location: HardState }> {
  const worldSchemaStore = createWorldSchemaStore({ connectionString });

  // The fixture world is a seed batch like any other, with pinned ids so tests
  // can reference the entities they assert on.
  await worldSchemaStore.commitBatch({
    entities: [
      { ...LOCATION_ROOT, ref: 'location' },
      { ...NON_LOCATION_ENTITIES[0], ref: 'warden' },
      { ...NON_LOCATION_ENTITIES[1], ref: 'relic' },
      { ...NON_LOCATION_ENTITIES[2], ref: 'species' },
      { ...NON_LOCATION_ENTITIES[3], ref: 'culture' },
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

  await seedRecentPlaywrightLore(worldSchemaStore);

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
