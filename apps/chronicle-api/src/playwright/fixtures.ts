import type {
  Character,
  Chronicle,
  LocationPlace,
  Login,
} from '@glass-frontier/dto';
import type { LocationGraphStore } from '@glass-frontier/persistence';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const PLAYWRIGHT_LOGIN_ID = 'playwright-e2e';
export const PLAYWRIGHT_CHARACTER_ID = '11111111-2222-4333-8444-555555555555';
export const PLAYWRIGHT_CHRONICLE_ID = 'aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const BASE_LOGIN: Login = {
  email: 'playwright@example.com',
  id: PLAYWRIGHT_LOGIN_ID,
  loginName: PLAYWRIGHT_LOGIN_ID,
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
  chronicleId: PLAYWRIGHT_CHRONICLE_ID,
  id: PLAYWRIGHT_CHARACTER_ID,
  inventory: [
    {
      id: "ova",
      kind: "relic",
      name: "Oracle Vessel",
      description: "Unlock the Vigil Gate",
      quantity: 1,
    },
    {
      id: "vas",
      kind: "supplies",
      name: "Vault Access Seed",
      description: "Unlock the Vigil Gate",
      quantity: 1,
    },
    {
      id: "sd",
      kind: "consumable",
      name: "Starlight Draught",
      description: "Unlock the Vigil Gate",
      quantity: 3,
    }
  ],
  loginId: PLAYWRIGHT_LOGIN_ID,
  momentum: {
    ceiling: 2,
    current: 0,
    floor: -2,
  },
  name: 'Playwright Canary',
  pronouns: 'they/them',
  skills: {
    fieldcraft: {
      attribute: 'focus',
      name: 'Fieldcraft',
      tier: 'apprentice',
      xp: 0,
    },
  },
  tags: ['playwright'],
};

const BASE_CHRONICLE: Chronicle = {
  beats: [],
  beatsEnabled: true,
  characterId: PLAYWRIGHT_CHARACTER_ID,
  id: PLAYWRIGHT_CHRONICLE_ID,
  locationId: '99999999-8888-4777-8666-555555555555',
  loginId: PLAYWRIGHT_LOGIN_ID,
  status: 'open',
  summaries: [],
  title: 'Playwright Chronicle',
};

type LocationPlaceSeed = {
  description: string;
  kind: string;
  name: string;
  tags: string[];
};

export const LOCATION_ROOT_SEED: LocationPlaceSeed & { id: string } = {
  description: 'Sunwashed gantry overlooking the orbital Quay.',
  id: BASE_CHRONICLE.locationId,
  kind: 'locale',
  name: 'Luminous Quay',
  tags: ['orbital', 'staging'],
};

export const LOCATION_CHILDREN_SEED: LocationPlaceSeed[] = [
  {
    description: 'Sensor gantries and maintenance access to the quay perimeter.',
    kind: 'locale',
    name: 'Auric Causeway',
    tags: ['concourse'],
  },
  {
    description: 'Pedestrian bridge lined with resonance spires.',
    kind: 'locale',
    name: 'Prism Walk',
    tags: ['bridge'],
  },
];

export const buildPlaywrightLoginRecord = (): Login => clone(BASE_LOGIN);
export const buildPlaywrightCharacterRecord = (): Character => clone(BASE_CHARACTER);
export const buildPlaywrightChronicleRecord = (
  options?: { locationId?: string }
): Chronicle => {
  const chronicle = clone(BASE_CHRONICLE);
  if (typeof options?.locationId === 'string') {
    chronicle.locationId = options.locationId;
  }
  return chronicle;
};

export const seedPlaywrightLocationGraph = async (
  store: LocationGraphStore,
  options: { locationId: string; characterId: string }
): Promise<{
  root: LocationPlace;
  places: Record<string, LocationPlace>;
}> => {
  const root = await store.ensureLocation({
    characterId: options.characterId,
    description: LOCATION_ROOT_SEED.description,
    kind: LOCATION_ROOT_SEED.kind,
    locationId: options.locationId,
    name: LOCATION_ROOT_SEED.name,
    tags: LOCATION_ROOT_SEED.tags,
  });

  const places: Record<string, LocationPlace> = {};
  for (const child of LOCATION_CHILDREN_SEED) {
    const place = await store.createPlace({
      description: child.description,
      kind: child.kind,
      locationId: root.id,
      name: child.name,
      parentId: root.id,
      tags: child.tags,
    });
    places[child.name] = place;
  }

  const auric = places['Auric Causeway'];
  const prism = places['Prism Walk'];

  if (auric && prism) {
    await store.addEdge({
      dst: prism.id,
      kind: 'ADJACENT_TO',
      locationId: root.id,
      metadata: {},
      src: auric.id,
    });
    await store.addEdge({
      dst: auric.id,
      kind: 'ADJACENT_TO',
      locationId: root.id,
      metadata: {},
      src: prism.id,
    });
  }

  await store.applyPlan({
    characterId: options.characterId,
    locationId: root.id,
    plan: {
      character_id: options.characterId,
      notes: 'seed-anchor',
      ops: auric
        ? [
            {
              dst_place_id: auric.id,
              op: 'MOVE',
            },
          ]
        : [],
    },
  });

  return { root, places };
};
