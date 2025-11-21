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
    'location',
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

describe('LocationStore', () => {
  it('returns canonical parents for descendants', async () => {
    const root = await worldState.locations.upsertLocation({ kind: 'region', name: 'Root' });
    const child = await worldState.locations.upsertLocation({
      kind: 'zone',
      name: 'Child',
      parentId: root.id,
    });
    const grandchild = await worldState.locations.upsertLocation({
      kind: 'room',
      name: 'Grandchild',
      parentId: child.id,
    });

    const details = await worldState.locations.getLocationDetails({ id: root.id });
    const byName = new Map(details.children.map((place) => [place.name, place]));

    expect(byName.size).toBe(2);
    expect(byName.get('Child')?.canonicalParentId).toBe(root.id);
    expect(byName.get('Grandchild')?.canonicalParentId).toBe(child.id);
  });

  it('resolves parent, children, and siblings in neighbors', async () => {
    const root = await worldState.locations.upsertLocation({ kind: 'region', name: 'Hub' });
    const first = await worldState.locations.upsertLocation({
      kind: 'zone',
      name: 'First',
      parentId: root.id,
    });
    const second = await worldState.locations.upsertLocation({
      kind: 'zone',
      name: 'Second',
      parentId: root.id,
    });
    const childOfFirst = await worldState.locations.upsertLocation({
      kind: 'room',
      name: 'Nested',
      parentId: first.id,
    });

    const neighbors = await worldState.locations.getLocationNeighbors({ id: first.id });

    expect(neighbors.parent?.id).toBe(root.id);
    expect(neighbors.children.map((place) => place.id)).toContain(childOfFirst.id);
    expect(neighbors.siblings.map((place) => place.id)).toContain(second.id);
  });

  it('upserts adjacency edges without duplication', async () => {
    const origin = await worldState.locations.upsertLocation({ kind: 'region', name: 'Origin' });
    const target = await worldState.locations.upsertLocation({ kind: 'region', name: 'Target' });

    await worldState.locations.upsertEdge({
      dst: target.id,
      kind: 'ADJACENT_TO',
      metadata: { note: 'first' },
      src: origin.id,
    });
    await worldState.locations.upsertEdge({
      dst: target.id,
      kind: 'ADJACENT_TO',
      metadata: { note: 'updated' },
      src: origin.id,
    });

    const neighbors = await worldState.locations.getLocationNeighbors({ id: origin.id });
    const adjacency = neighbors.adjacent.filter((entry) => entry.neighbor.id === target.id);

    expect(adjacency).toHaveLength(1);
    expect(adjacency[0]?.edge.metadata).toEqual({ note: 'updated' });
  });

  it('creates locations with requested relationships', async () => {
    const root = await worldState.locations.upsertLocation({ kind: 'region', name: 'Root A' });
    const anchor = await worldState.locations.upsertLocation({
      kind: 'zone',
      name: 'Anchor',
      parentId: root.id,
    });

    const inside = await worldState.locations.createLocationWithRelationship({
      anchorId: anchor.id,
      kind: 'room',
      name: 'Inside',
      relationship: 'inside',
    });
    const adjacent = await worldState.locations.createLocationWithRelationship({
      anchorId: anchor.id,
      kind: 'room',
      name: 'Next Door',
      relationship: 'adjacent',
    });
    const neighbors = await worldState.locations.getLocationNeighbors({ id: anchor.id });

    expect(inside.canonicalParentId).toBe(anchor.id);
    expect(adjacent.canonicalParentId).toBe(root.id);
    expect(neighbors.adjacent.map((entry) => entry.neighbor.id)).toContain(adjacent.id);
  });

  it('removes locations and their edges', async () => {
    const root = await worldState.locations.upsertLocation({ kind: 'region', name: 'Root B' });
    const child = await worldState.locations.upsertLocation({
      kind: 'zone',
      name: 'Disposable',
      parentId: root.id,
    });
    await worldState.locations.upsertEdge({
      dst: root.id,
      kind: 'LINKS_TO',
      src: child.id,
    });

    await worldState.locations.deleteLocation({ id: child.id });
    const lookup = await worldState.locations.getPlace(child.id);
    const neighbors = await worldState.locations.getLocationNeighbors({ id: root.id });

    expect(lookup).toBeNull();
    expect(neighbors.children.some((place) => place.id === child.id)).toBe(false);
    expect(neighbors.links.some((entry) => entry.neighbor.id === child.id)).toBe(false);
  });

  it('tracks character location relative to the root place', async () => {
    const root = await worldState.locations.upsertLocation({ kind: 'region', name: 'Base' });
    const room = await worldState.locations.upsertLocation({
      kind: 'room',
      name: 'Room',
      parentId: root.id,
    });
    const character = await worldState.chronicles.upsertCharacter(
      defaultCharacter({ name: 'Mover' })
    );

    const state = await worldState.locations.moveCharacterToLocation({
      characterId: character.id,
      placeId: room.id,
      status: ['walking'],
    });
    const persisted = await worldState.locations.getLocationState(character.id);

    expect(state.locationId).toBe(root.id);
    expect(state.anchorPlaceId).toBe(room.id);
    expect(persisted).not.toBeNull();
    expect(persisted?.locationId).toBe(root.id);
    expect(persisted?.anchorPlaceId).toBe(room.id);
    expect(persisted?.status).toEqual(['walking']);
  });

  it('persists and lists location events', async () => {
    const location = await worldState.locations.upsertLocation({ kind: 'region', name: 'Events' });
    const chronicle = await worldState.chronicles.ensureChronicle({
      characterId: undefined,
      locationId: location.id,
      playerId: TEST_PLAYER_ID,
      title: 'Events Chronicle',
    });

    const inserted = await worldState.locations.appendLocationEvents({
      events: [
        { chronicleId: chronicle.id, summary: 'Event one' },
        { chronicleId: chronicle.id, summary: 'Event two', metadata: { severity: 'low' } },
      ],
      locationId: location.id,
    });
    const listed = await worldState.locations.listLocationEvents({ locationId: location.id });

    expect(inserted).toHaveLength(2);
    expect(listed.map((event) => event.summary)).toEqual(['Event one', 'Event two']);
    expect(listed[0]?.chronicleId).toBe(chronicle.id);
    expect(listed[1]?.metadata).toEqual({ severity: 'low' });
  });
});

describe('World schema', () => {
  it('persists hard state with directed links', async () => {
    const faction = await worldState.world.upsertHardState({
      kind: 'faction',
      name: 'Glass Wardens',
      status: 'active',
      subkind: 'order',
    });
    const npc = await worldState.world.upsertHardState({
      kind: 'npc',
      name: 'Mirin',
      status: 'alive',
      subkind: 'ally',
    });
    const updated = await worldState.world.upsertHardState({
      ...faction,
      links: [{ relationship: 'ally_of', targetId: npc.id }],
      name: 'Glass Wardens',
    });
    const linked = await worldState.world.getHardState({ id: npc.id });

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
      worldState.world.upsertHardState({
        kind: 'npc',
        name: 'Unknown',
        status: 'ghost' as unknown as HardStateStatus,
      })
    ).rejects.toThrowError(/Status ghost is not allowed/);
  });

  it('rejects disallowed relationships between kinds', async () => {
    const location = await worldState.world.upsertHardState({
      kind: 'location',
      name: 'Forbidden Site',
      status: 'known',
      subkind: 'site',
    });
    const artifact = await worldState.world.upsertHardState({
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
    const place = await worldState.locations.upsertLocation({ kind: 'region', name: 'Lore Root Place' });
    const root = await worldState.world.upsertHardState({
      id: place.id,
      kind: 'location',
      name: 'Lore Root',
      status: 'known',
      subkind: 'site',
    });
    const character = await worldState.chronicles.upsertCharacter(defaultCharacter());
    const chronicle = await worldState.chronicles.upsertChronicle(
      defaultChronicle(place.id, { characterId: character.id })
    );

    const fragment = await worldState.world.createLoreFragment({
      entityId: root.id,
      prose: 'An old story about the root.',
      source: { beatId: 'beat-1', chronicleId: chronicle.id, turnRange: [0, 2] },
      tags: ['Myth', 'origin'],
      title: 'Origin Story',
    });
    const listed = await worldState.world.listLoreFragmentsByEntity({ entityId: root.id });

    expect(fragment.title).toBe('Origin Story');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.source.turnRange).toEqual([0, 2]);
    expect(listed[0]?.tags).toEqual(['myth', 'origin']);
  });
});

describe('WorldStateStore', () => {
  it('creates characters and chronicles with turn history', async () => {
    const startingLocation = await worldState.locations.upsertLocation({
      kind: 'region',
      name: 'Chronicle Root',
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
    expect(snapshot?.location?.anchorPlaceId).toBe(startingLocation.id);
  });

  it('ensures chronicle retrieval respects the most recent turn ordering', async () => {
    const location = await worldState.locations.upsertLocation({ kind: 'region', name: 'Order' });
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
    const anchor = await worldState.world.upsertHardState({
      kind: 'location',
      name: 'Anchor Site',
      status: 'known',
      subkind: 'site',
    });
    const location = await worldState.locations.upsertLocation({ kind: 'region', name: 'Anchor Location' });
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
