import type { SessionLocationChain } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { WorldState } from '../src/worldState';
import {
  commitChronicleTurn,
  defaultChronicle,
  defaultTurn,
  resetDatabase,
  seedEntity,
  startHarness,
  TEST_PLAYER_ID,
} from './harness';

const STAIR = 'The Sunken Stair';
const VESTIBULE = 'Drowned Vestibule';

let pool: Pool;
let worldState: WorldState;

beforeAll(async () => {
  ({ pool, worldState } = await startHarness());
});

beforeEach(async () => {
  await resetDatabase(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('Session location chain', () => {
  it('keeps every discovered place and how it was reached', async () => {
    const canon = await seedEntity(worldState, {
      kind: 'location',
      name: 'Known Quay',
      status: 'known',
      subkind: 'district',
    });
    const chronicle = await worldState.chronicles.ensureChronicle({
      locationId: canon.id,
      playerId: TEST_PLAYER_ID,
      title: 'Wandering',
    });

    const firstId = randomUUID();
    const secondId = randomUUID();
    const chain: SessionLocationChain = [
      {
        description: undefined,
        id: firstId,
        name: STAIR,
        reachedFrom: { id: canon.id, isCanon: true, name: canon.name },
        relationship: 'below',
        tags: [],
        visitedAt: Date.now(),
      },
      {
        description: undefined,
        id: secondId,
        name: VESTIBULE,
        reachedFrom: { id: firstId, isCanon: false, name: STAIR },
        relationship: 'through',
        tags: [],
        visitedAt: Date.now(),
      },
    ];

    await commitChronicleTurn(
      worldState,
      chronicle,
      defaultTurn(chronicle.id, { turnSequence: 0 })
    );
    await worldState.chronicles.commitTurn({
      character: null,
      chronicle,
      discoveredLocations: chain,
      location: {
        createdAt: Date.now(),
        id: secondId,
        kind: 'location',
        name: VESTIBULE,
        prominence: 'recognized',
        slug: `session-${secondId}`,
        status: 'session-only',
        tags: [],
        updatedAt: Date.now(),
      },
      turn: defaultTurn(chronicle.id, { turnSequence: 1 }),
    });

    const state = await worldState.chronicles.getChronicleState(chronicle.id);

    expect(state?.discoveredLocations).toHaveLength(2);
    expect(state?.location?.name).toBe(VESTIBULE);
    // The route back is intact: vestibule -> stair -> canon quay.
    expect(state?.discoveredLocations[1]?.reachedFrom.id).toBe(firstId);
    expect(state?.discoveredLocations[0]?.reachedFrom.id).toBe(canon.id);
    expect(state?.discoveredLocations[0]?.reachedFrom.isCanon).toBe(true);
  });

  it('starts a chronicle with an empty chain', async () => {
    const canon = await seedEntity(worldState, {
      kind: 'location',
      name: 'Still Harbour',
      status: 'known',
      subkind: 'district',
    });
    const chronicle = await worldState.chronicles.upsertChronicle(defaultChronicle(canon.id));
    await commitChronicleTurn(
      worldState,
      chronicle,
      defaultTurn(chronicle.id, { turnSequence: 0 })
    );

    const state = await worldState.chronicles.getChronicleState(chronicle.id);
    expect(state?.discoveredLocations).toEqual([]);
  });

  it('never writes a discovered place into canon', async () => {
    const canon = await seedEntity(worldState, {
      kind: 'location',
      name: 'Anchor Point',
      status: 'known',
      subkind: 'district',
    });
    const chronicle = await worldState.chronicles.ensureChronicle({
      locationId: canon.id,
      playerId: TEST_PLAYER_ID,
      title: 'Off the map',
    });
    const inventedId = randomUUID();

    await worldState.chronicles.commitTurn({
      character: null,
      chronicle,
      discoveredLocations: [
        {
          description: undefined,
          id: inventedId,
          name: 'Nowhere In Particular',
          reachedFrom: { id: canon.id, isCanon: true, name: canon.name },
          relationship: 'past',
          tags: [],
          visitedAt: Date.now(),
        },
      ],
      location: null,
      turn: defaultTurn(chronicle.id, { turnSequence: 0 }),
    });

    expect(await worldState.world.getEntity({ id: inventedId })).toBeNull();
    const locations = await worldState.world.listEntities({
      kind: 'location',
      minProminence: 'forgotten',
    });
    expect(locations.map((entity) => entity.name)).toEqual(['Anchor Point']);
  });
});
