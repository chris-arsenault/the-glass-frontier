import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Character, Chronicle, HardStateStatus, Turn } from '@glass-frontier/dto';
import { runner, type RunnerOption } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { WorldState } from '../src/worldState';

const TEST_DATABASE_URL =
  process.env.WORLDSTATE_TEST_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/worldstate_test';
const TEST_PLAYER_ID = 'player-worldstate-test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

let pool: Pool;
let worldState: WorldState;

const parseDatabaseName = (connectionString: string): { adminUrl: string; dbName: string } => {
  const url = new URL(connectionString);
  const candidate = url.pathname.replace(/^\//, '') || 'worldstate_test';
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

const bootstrapAppSchema = async (executor: Pool): Promise<void> => {
  await executor.query('CREATE SCHEMA IF NOT EXISTS app');
  await executor.query('CREATE TABLE IF NOT EXISTS app.player (id text PRIMARY KEY)');
};

const runMigrations = async (connectionString: string): Promise<void> => {
  const options: RunnerOption = {
    count: Infinity,
    databaseUrl: connectionString,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'worldstate_migrations',
  };
  await runner(options);
};

const resetDatabase = async (executor: Pool): Promise<void> => {
  const tables = [
    'lore_fragment',
    'location_event',
    'chronicle_turn',
    'chronicle',
    'hard_state',
    'character',
    'edge',
    'node',
  ];
  await executor.query(
    `TRUNCATE ${tables.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`
  );
  await executor.query('DELETE FROM app.player');
  await executor.query('INSERT INTO app.player (id) VALUES ($1)', [TEST_PLAYER_ID]);
};

const defaultCharacter = (overrides?: Partial<Character>): Character => ({
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
  playerId: TEST_PLAYER_ID,
  pronouns: 'they/them',
  skills: {
    navigation: { attribute: 'resolve', name: 'navigation', tier: 'apprentice', xp: 0 },
  },
  tags: [],
  ...overrides,
});

const defaultChronicle = (locationId: string, overrides?: Partial<Chronicle>): Chronicle => ({
  beats: [],
  beatsEnabled: true,
  id: randomUUID(),
  locationId,
  metadata: undefined,
  playerId: TEST_PLAYER_ID,
  seedText: undefined,
  status: 'open',
  summaries: [],
  targetEndTurn: null,
  title: 'Journey',
  ...overrides,
});

const defaultTurn = (chronicleId: string, overrides?: Partial<Turn>): Turn => ({
  advancesTimeline: false,
  beatTracker: undefined,
  chronicleId,
  executedNodes: [],
  failure: false,
  gmResponse: undefined,
  gmSummary: undefined,
  gmTrace: undefined,
  handlerId: 'handler',
  id: randomUUID(),
  inventoryDelta: undefined,
  playerIntent: undefined,
  playerMessage: {
    content: 'A move is made',
    id: randomUUID(),
    metadata: {},
    role: 'player',
  },
  resolvedIntentConfidence: undefined,
  resolvedIntentType: undefined,
  skillCheckPlan: undefined,
  skillCheckResult: undefined,
  systemMessage: undefined,
  turnSequence: 0,
  worldDeltaTags: [],
  ...overrides,
});

beforeAll(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await bootstrapAppSchema(pool);
  await runMigrations(TEST_DATABASE_URL);
  worldState = WorldState.create({ pool });
});

beforeEach(async () => {
  await resetDatabase(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('Locations as hard state', () => {
  it('creates missing location entries as hard state when starting a chronicle', async () => {
    const locationId = randomUUID();
    const chronicle = await worldState.chronicles.ensureChronicle({
      characterId: undefined,
      locationId,
      playerId: TEST_PLAYER_ID,
      title: 'Missing Location Chronicle',
    });
    const hardState = await worldState.world.getEntity({ id: locationId });

    expect(chronicle.locationId).toBe(locationId);
    expect(hardState?.kind).toBe('location');
    expect(hardState?.name).toBe('Missing Location Chronicle');
  });

  it('summarizes chronicle locations from hard state records', async () => {
    const location = await worldState.world.upsertEntity({
      kind: 'location',
      name: 'Atlas Landing',
      status: 'known',
      subkind: 'site',
    });
    const chronicle = await worldState.chronicles.ensureChronicle({
      characterId: undefined,
      locationId: location.id,
      playerId: TEST_PLAYER_ID,
      title: 'Anchored Chronicle',
    });
    const state = await worldState.chronicles.getChronicleState(chronicle.id);

    expect(state?.location?.id).toBe(location.id);
    expect(state?.location?.name).toBe('Atlas Landing');
    expect(state?.location?.status).toBe('known');
  });
});

describe('World schema', () => {
  it('persists hard state with directed links', async () => {
    const faction = await worldState.world.upsertEntity({
      kind: 'faction',
      name: 'Glass Wardens',
      status: 'active',
      subkind: 'order',
    });
    const npc = await worldState.world.upsertEntity({
      kind: 'npc',
      name: 'Mirin',
      status: 'alive',
      subkind: 'ally',
    });
    const updated = await worldState.world.upsertEntity({
      ...faction,
      links: [{ relationship: 'ally_of', targetId: npc.id }],
      name: 'Glass Wardens',
    });
    const linked = await worldState.world.getEntity({ id: npc.id });

    expect(updated.links).toEqual([{ relationship: 'ally_of', targetId: npc.id, direction: 'out' }]);
    expect(linked?.links).toContainEqual({
      direction: 'in',
      relationship: 'ally_of',
      targetId: faction.id,
    });
    expect(updated.status).toBe('active');
  });

  it('rejects unsupported hard state status', async () => {
    await expect(
      worldState.world.upsertEntity({
        kind: 'npc',
        name: 'Unknown',
        status: 'ghost' as unknown as HardStateStatus,
      })
    ).rejects.toThrowError(/Status ghost is not allowed/);
  });

  it('rejects disallowed relationships between kinds', async () => {
    const location = await worldState.world.upsertEntity({
      kind: 'location',
      name: 'Forbidden Site',
      status: 'known',
      subkind: 'site',
    });
    const artifact = await worldState.world.upsertEntity({
      kind: 'artifact',
      name: 'Lost Relic',
      status: 'intact',
      subkind: 'relic',
    });
    await expect(
      worldState.world.upsertRelationship({
        relationship: 'controls',
        srcId: location.id,
        dstId: artifact.id,
      })
    ).rejects.toThrowError(/not allowed/);
  });

  it('creates lore fragments linked to hard state', async () => {
    const root = await worldState.world.upsertEntity({
      kind: 'location',
      name: 'Lore Root',
      status: 'known',
      subkind: 'site',
    });
    const character = await worldState.chronicles.upsertCharacter(defaultCharacter());
    const chronicle = await worldState.chronicles.upsertChronicle(
      defaultChronicle(root.id, { characterId: character.id })
    );

    const fragment = await worldState.world.createLoreFragment({
      entityId: root.id,
      prose: 'An old story about the root.',
      source: { beatId: 'beat-1', chronicleId: chronicle.id },
      tags: ['Myth', 'origin'],
      title: 'Origin Story',
    });
    const listed = await worldState.world.listLoreFragmentsByEntity({ entityId: root.id });

    expect(fragment.title).toBe('Origin Story');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.tags).toEqual(['myth', 'origin']);
  });
});

describe('ChronicleStore', () => {
  it('creates characters and chronicles with turn history', async () => {
    const startingLocation = await worldState.world.upsertEntity({
      kind: 'location',
      name: 'Chronicle Root',
      status: 'known',
      subkind: 'region',
    });
    const character = await worldState.chronicles.upsertCharacter(defaultCharacter());
    const chronicle = await worldState.chronicles.upsertChronicle(
      defaultChronicle(startingLocation.id, { characterId: character.id })
    );

    const turn = await worldState.chronicles.addTurn(
      defaultTurn(chronicle.id, {
        gmSummary: 'Summary',
        turnSequence: 0,
      })
    );
    const snapshot = await worldState.chronicles.getChronicleState(chronicle.id);

    expect(chronicle.playerId).toBe(TEST_PLAYER_ID);
    expect(turn.turnSequence).toBe(0);
    expect(snapshot?.turns).toHaveLength(1);
    expect(snapshot?.character?.id).toBe(character.id);
    expect(snapshot?.location?.id).toBe(startingLocation.id);
  });

  it('ensures chronicle retrieval respects the most recent turn ordering', async () => {
    const location = await worldState.world.upsertEntity({
      kind: 'location',
      name: 'Order',
      status: 'known',
      subkind: 'region',
    });
    const chronicle = await worldState.chronicles.ensureChronicle({
      characterId: undefined,
      locationId: location.id,
      playerId: TEST_PLAYER_ID,
      title: 'Ordering',
    });
    await worldState.chronicles.addTurn(
      defaultTurn(chronicle.id, { turnSequence: 0, gmSummary: 'first' })
    );
    await worldState.chronicles.addTurn(
      defaultTurn(chronicle.id, { turnSequence: 1, gmSummary: 'second' })
    );

    const state = await worldState.chronicles.getChronicleState(chronicle.id);

    expect(state?.turnSequence).toBe(1);
    expect(state?.turns.map((t) => t.turnSequence)).toEqual([0, 1]);
  });

  it('persists chronicle anchor entities', async () => {
    const anchor = await worldState.world.upsertEntity({
      kind: 'location',
      name: 'Anchor Site',
      status: 'known',
      subkind: 'site',
    });
    const location = await worldState.world.upsertEntity({
      kind: 'location',
      name: 'Anchor Location',
      status: 'known',
      subkind: 'region',
    });
    const chronicle = await worldState.chronicles.ensureChronicle({
      anchorEntityId: anchor.id,
      locationId: location.id,
      playerId: TEST_PLAYER_ID,
      title: 'Anchored Chronicle',
    });
    const retrieved = await worldState.chronicles.getChronicle(chronicle.id);

    expect(retrieved?.anchorEntityId).toBe(anchor.id);
  });
});
