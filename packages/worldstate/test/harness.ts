import type {
  CanonProposal,
  Character,
  Chronicle,
  HardState,
  HardStateKind,
  HardStateStatus,
  HardStateSubkind,
  Turn,
} from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

import { applyMigrations, applySeed } from '../../../scripts/dbMigrate';
import { WorldState } from '../src/worldState';

export const TEST_DATABASE_URL =
  process.env.WORLDSTATE_TEST_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/worldstate_test';
export const TEST_PLAYER_ID = 'player-worldstate-test';

const parseDatabaseName = (connectionString: string): { adminUrl: string; dbName: string } => {
  const url = new URL(connectionString);
  const pathname = url.pathname.replace(/^\//, '');
  const candidate = pathname.length === 0 ? 'worldstate_test' : pathname;
  if (!/^[a-zA-Z0-9_]+$/.test(candidate)) {
    throw new Error(`Unsafe database name for tests: ${candidate}`);
  }
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = '/postgres';
  return { adminUrl: adminUrl.toString(), dbName: candidate };
};

const ensureTestDatabase = async (connectionString: string): Promise<void> => {
  const { adminUrl, dbName } = parseDatabaseName(connectionString);
  const adminPool = new Pool({ connectionString: adminUrl });
  try {
    await adminPool.query('SELECT 1');
  } catch (error) {
    throw new Error(
      `Postgres is required for @glass-frontier/worldstate tests. Start the database (e.g. "docker compose -f docker-compose.e2e.yml up -d postgres"). Original error: ${
        (error as Error).message
      }`
    );
  }
  try {
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await adminPool.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await adminPool.end();
  }
};

export type Harness = {
  pool: Pool;
  worldState: WorldState;
};

/**
 * Builds the test database by applying `db/migrations` and its seed — the same
 * files, through the same runner, that local development uses and that the
 * deploy hands to the Ahara migrate Lambda. There is no second schema: if a
 * column is missing in production it is missing here, and these tests fail.
 */
export const startHarness = async (): Promise<Harness> => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await applyMigrations(pool);
  await applySeed(pool);
  return { pool, worldState: WorldState.create({ pool }) };
};

export const resetDatabase = async (executor: Pool): Promise<void> => {
  const tables = [
    'lore_fragment',
    'chronicle_turn',
    'chronicle',
    'entity',
    'character',
    'edge',
    'node',
    'ingest_batch',
  ];
  await executor.query(
    `TRUNCATE ${tables.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`
  );
  await executor.query('DELETE FROM app.player');
  await executor.query('INSERT INTO app.player (id, username) VALUES ($1, $1)', [
    TEST_PLAYER_ID,
  ]);
};

export const proposal = (overrides: Partial<CanonProposal>): CanonProposal => ({
  entities: [],
  lore: [],
  relationships: [],
  source: 'seed',
  ...overrides,
});

/** Commits a one-entity batch and returns the stored entity. */
export const seedEntity = async (
  worldState: WorldState,
  input: {
    kind: HardStateKind;
    name: string;
    status?: HardStateStatus;
    subkind?: HardStateSubkind;
  }
): Promise<HardState> => {
  const result = await worldState.world.commitBatch(
    proposal({ entities: [{ ...input, ref: 'subject' }] })
  );
  const entity = await worldState.world.getEntity({ id: result.entityIdsByRef.subject });
  if (entity === null) {
    throw new Error('Seeded entity was not committed');
  }
  return entity;
};

export const defaultCharacter = (overrides?: Partial<Character>): Character => ({
  archetype: 'tester',
  attributes: {
    attunement: 'standard',
    finesse: 'standard',
    focus: 'standard',
    ingenuity: 'standard',
    presence: 'standard',
    resolve: 'standard',
    vitality: 'standard',
  },
  bio: 'Test bio',
  id: randomUUID(),
  inventory: [],
  momentum: { ceiling: 3, current: 0, floor: -2 },
  name: 'Test Character',
  nature: {
    callings: ['navigator', 'archivist'],
    drive: 'To chart the frontier',
    flaw: 'Never lets a map stay finished',
    instinct: 'Check the stars first',
    uniqueThing: 'Keeps a hand-drawn atlas',
  },
  origin: {
    allegianceId: '00000000-0000-0000-0000-000000000001',
    allegianceStance: 'member',
    cultureId: '00000000-0000-0000-0000-000000000002',
    homelandId: '00000000-0000-0000-0000-000000000003',
    speciesId: '00000000-0000-0000-0000-000000000004',
  },
  playerId: TEST_PLAYER_ID,
  pronouns: 'they/them',
  skills: {
    navigation: { attribute: 'resolve', name: 'navigation', tier: 'apprentice', xp: 0 },
  },
  tags: [],
  ...overrides,
});

export const defaultChronicle = (
  locationName: string,
  overrides?: Partial<Chronicle>
): Chronicle => ({
  activeScene: null,
  beats: [],
  entityFocus: { entityScores: {}, tagScores: {} },
  entityRoster: {
    entries: [],
    locationName,
    sceneId: null,
    updatedAtTurn: 0,
  },
  id: randomUUID(),
  locationName,
  metadata: undefined,
  openingText: '',
  playerId: TEST_PLAYER_ID,
  sceneLedger: null,
  seedText: undefined,
  status: 'open',
  summaries: [],
  targetEndTurn: null,
  title: 'Journey',
  toneChips: [],
  toneNotes: '',
  ...overrides,
});

export const defaultTurn = (chronicleId: string, overrides?: Partial<Turn>): Turn => ({
  advancesTimeline: false,
  beatTracker: undefined,
  chronicleId,
  executedNodes: [],
  failure: false,
  gmResponse: undefined,
  gmSummary: undefined,
  gmTrace: undefined,
  id: randomUUID(),
  inventoryDelta: undefined,
  playerIntent: undefined,
  playerMessage: {
    content: 'A move is made',
    id: randomUUID(),
    metadata: { tags: [], timestamp: Date.now() },
    role: 'player',
  },
  sceneContext: undefined,
  skillCheckPlan: undefined,
  skillCheckResult: undefined,
  systemMessage: undefined,
  turnSequence: 0,
  ...overrides,
});

export const commitChronicleTurn = async (
  worldState: WorldState,
  chronicle: Chronicle,
  turn: Turn
): Promise<Turn> => {
  const state = await worldState.chronicles.getChronicleState(chronicle.id);
  return worldState.chronicles.commitTurn({
    character: state?.character ?? null,
    chronicle,
    turn,
  });
};
