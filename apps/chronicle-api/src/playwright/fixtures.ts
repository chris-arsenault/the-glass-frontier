import type {
  CharacterDraft,
  ChronicleDraft,
  LocationDraft,
  LocationGraphSnapshot,
  Login,
  WorldStateStoreV2,
} from '@glass-frontier/worldstate';
import { randomUUID } from 'node:crypto';

export const PLAYWRIGHT_LOGIN_ID = 'playwright-e2e';
export const PLAYWRIGHT_CHARACTER_ID = '11111111-2222-4333-8444-555555555555';
export const PLAYWRIGHT_CHRONICLE_ID = 'aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeeee';
export const PLAYWRIGHT_LOCATION_ID = '99999999-8888-4777-8666-555555555555';

const nowIso = (): string => new Date().toISOString();

export const buildPlaywrightLoginRecord = (): Login => {
  const timestamp = nowIso();
  return {
    createdAt: timestamp,
    id: PLAYWRIGHT_LOGIN_ID,
    loginName: PLAYWRIGHT_LOGIN_ID,
    updatedAt: timestamp,
  };
};

export const buildPlaywrightCharacterRecord = (): CharacterDraft => ({
  id: PLAYWRIGHT_CHARACTER_ID,
  archetype: 'Recon',
  attributes: {
    resolve: 'rook',
    cunning: 'rook',
    vigor: 'rook',
    focus: 'rook',
    heart: 'rook',
  },
  bio: 'Seeded character for Playwright tests.',
  echoes: [],
  inventory: {
    carried: [],
    stored: [],
    equipped: {},
    capacity: 10,
  },
  loginId: PLAYWRIGHT_LOGIN_ID,
  metadata: {},
  momentum: {
    current: 0,
    floor: -2,
    ceiling: 2,
  },
  name: 'Playwright Canary',
  pronouns: 'they/them',
  skills: {
    fieldcraft: {
      name: 'Fieldcraft',
      tier: 'rook',
      tags: [],
    },
  },
  tags: ['playwright'],
});

export const buildPlaywrightChronicleRecord = (
  options?: { locationId?: string }
): ChronicleDraft => ({
  id: PLAYWRIGHT_CHRONICLE_ID,
  characterId: PLAYWRIGHT_CHARACTER_ID,
  loginId: PLAYWRIGHT_LOGIN_ID,
  title: 'Playwright Chronicle',
  status: 'active',
  locationId: options?.locationId ?? PLAYWRIGHT_LOCATION_ID,
  tags: ['playwright'],
  beats: [],
  beatsEnabled: true,
  summaries: [],
});

const buildLocationSnapshot = (locationId: string): LocationGraphSnapshot => {
  const rootPlaceId = `${locationId}-root`;
  const auricId = `${locationId}-auric`;
  const prismId = `${locationId}-prism`;
  return {
    locationId,
    places: [
      {
        id: rootPlaceId,
        name: 'Luminous Quay',
        kind: 'locale',
        description: 'Sunwashed gantry overlooking the orbital quay.',
        tags: ['orbital', 'staging'],
      },
      {
        id: auricId,
        name: 'Auric Causeway',
        kind: 'locale',
        description: 'Sensor gantries and maintenance access to the quay perimeter.',
        tags: ['concourse'],
      },
      {
        id: prismId,
        name: 'Prism Walk',
        kind: 'locale',
        description: 'Pedestrian bridge lined with resonance spires.',
        tags: ['bridge'],
      },
    ],
    edges: [
      {
        id: randomUUID(),
        src: rootPlaceId,
        dst: auricId,
        kind: 'ADJACENT_TO',
      },
      {
        id: randomUUID(),
        src: rootPlaceId,
        dst: prismId,
        kind: 'ADJACENT_TO',
      },
    ],
  };
};

const buildLocationDraft = (options: {
  loginId: string;
  chronicleId: string;
  locationId: string;
}): LocationDraft => {
  const rootPlaceId = `${options.locationId}-root`;
  return {
    id: options.locationId,
    loginId: options.loginId,
    chronicleId: options.chronicleId,
    name: 'Luminous Quay',
    anchorPlaceId: rootPlaceId,
    breadcrumb: [
      {
        id: rootPlaceId,
        kind: 'locale',
        name: 'Luminous Quay',
      },
    ],
    description: 'Sunwashed gantry overlooking the orbital quay.',
    status: [],
    tags: ['orbital', 'staging'],
    nodeCount: 3,
    edgeCount: 2,
    graphChunkCount: 1,
    graph: buildLocationSnapshot(options.locationId),
  };
};

export const seedPlaywrightLocationGraph = async (
  store: WorldStateStoreV2,
  options: { loginId: string; chronicleId: string; locationId: string }
): Promise<void> => {
  await store.createLocation(buildLocationDraft(options));
};
