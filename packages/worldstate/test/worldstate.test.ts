import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { WorldState } from '../src/worldState';
import {
  commitChronicleTurn,
  defaultChronicle,
  defaultCharacter,
  defaultTurn,
  resetDatabase,
  seedEntity,
  startHarness,
  TEST_PLAYER_ID,
} from './harness';

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

describe('Chronicle location', () => {
  it('starts somewhere the world has never heard of', async () => {
    const chronicle = await worldState.chronicles.ensureChronicle({
      characterId: undefined,
      locationName: 'A Nameless Ridge',
      playerId: TEST_PLAYER_ID,
      title: 'Off the Map',
    });
    const state = await worldState.chronicles.getChronicleState(chronicle.id);

    expect(state?.locationName).toBe('A Nameless Ridge');
    expect(chronicle.locationId).toBeUndefined();
  });

  it('remembers the canon place it started from', async () => {
    const location = await seedEntity(worldState, {
      kind: 'location',
      name: 'Atlas Landing',
      status: 'known',
      subkind: 'site',
    });
    const chronicle = await worldState.chronicles.ensureChronicle({
      characterId: undefined,
      locationId: location.id,
      locationName: location.name,
      playerId: TEST_PLAYER_ID,
      title: 'Anchored Chronicle',
    });
    const state = await worldState.chronicles.getChronicleState(chronicle.id);

    expect(state?.locationName).toBe('Atlas Landing');
    expect(chronicle.locationId).toBe(location.id);
  });

  it('moves by name without touching canon', async () => {
    const location = await seedEntity(worldState, {
      kind: 'location',
      name: 'Departure Point',
      status: 'known',
      subkind: 'site',
    });
    const chronicle = await worldState.chronicles.ensureChronicle({
      locationId: location.id,
      locationName: location.name,
      playerId: TEST_PLAYER_ID,
      title: 'Wandering',
    });

    await commitChronicleTurn(
      worldState,
      { ...chronicle, locationName: 'The Sunken Stair' },
      defaultTurn(chronicle.id, { turnSequence: 0 })
    );
    const state = await worldState.chronicles.getChronicleState(chronicle.id);

    expect(state?.locationName).toBe('The Sunken Stair');
    // The place the player walked to is a name; the world never learned it.
    const canon = await worldState.world.listEntities({
      kind: 'location',
      minProminence: 'forgotten',
    });
    expect(canon.map((entity) => entity.name)).toEqual(['Departure Point']);
  });
});

describe('Chronicle turn history', () => {
  it('creates characters and chronicles with turn history', async () => {
    const startingLocation = await seedEntity(worldState, {
      kind: 'location',
      name: 'Chronicle Root',
      status: 'known',
      subkind: 'region',
    });
    const character = await worldState.chronicles.upsertCharacter(defaultCharacter());
    const chronicle = await worldState.chronicles.upsertChronicle(
      defaultChronicle(startingLocation.name, { characterId: character.id })
    );

    const turn = await commitChronicleTurn(
      worldState,
      chronicle,
      defaultTurn(chronicle.id, { gmSummary: 'Summary', turnSequence: 0 })
    );
    const snapshot = await worldState.chronicles.getChronicleState(chronicle.id);

    expect(chronicle.playerId).toBe(TEST_PLAYER_ID);
    expect(turn.turnSequence).toBe(0);
    expect(snapshot?.turns).toHaveLength(1);
    expect(snapshot?.character?.id).toBe(character.id);
    expect(snapshot?.locationName).toBe(startingLocation.name);
  });

  it('persists the entities the GM was offered and how it used them', async () => {
    const location = await seedEntity(worldState, {
      kind: 'location',
      name: 'Offer Root',
      status: 'known',
      subkind: 'region',
    });
    const chronicle = await worldState.chronicles.upsertChronicle(defaultChronicle(location.name));
    await commitChronicleTurn(
      worldState,
      chronicle,
      defaultTurn(chronicle.id, {
        entityOffered: [
          {
            description: undefined,
            id: location.id,
            kind: 'location',
            loreFragments: [],
            name: 'Offer Root',
            score: 5,
            slug: location.slug,
            status: 'known',
            subkind: 'region',
            tags: [],
          },
        ],
        entityUsage: [
          {
            emergentTags: ['storm-lit'],
            entityId: location.id,
            entitySlug: location.slug,
            tags: [],
            usage: 'central',
          },
        ],
        turnSequence: 0,
      })
    );

    const turns = await worldState.chronicles.listChronicleTurns(chronicle.id);
    expect(turns[0]?.entityOffered?.[0]?.slug).toBe(location.slug);
    expect(turns[0]?.entityUsage?.[0]?.usage).toBe('central');
  });
});

describe('Chronicle retrieval', () => {
  it('ensures chronicle retrieval respects the most recent turn ordering', async () => {
    const location = await seedEntity(worldState, {
      kind: 'location',
      name: 'Order',
      status: 'known',
      subkind: 'region',
    });
    const chronicle = await worldState.chronicles.ensureChronicle({
      characterId: undefined,
      locationId: location.id,
      locationName: location.name,
      playerId: TEST_PLAYER_ID,
      title: 'Ordering',
    });
    await commitChronicleTurn(
      worldState,
      chronicle,
      defaultTurn(chronicle.id, { gmSummary: 'first', turnSequence: 0 })
    );
    await commitChronicleTurn(
      worldState,
      chronicle,
      defaultTurn(chronicle.id, { gmSummary: 'second', turnSequence: 1 })
    );

    const state = await worldState.chronicles.getChronicleState(chronicle.id);

    expect(state?.turnSequence).toBe(1);
    expect(state?.turns.map((t) => t.turnSequence)).toEqual([0, 1]);
  });
});

describe('Chronicle anchors', () => {
  it('persists chronicle anchor entities', async () => {
    const anchor = await seedEntity(worldState, {
      kind: 'location',
      name: 'Anchor Site',
      status: 'known',
      subkind: 'site',
    });
    const location = await seedEntity(worldState, {
      kind: 'location',
      name: 'Anchor Location',
      status: 'known',
      subkind: 'region',
    });
    const chronicle = await worldState.chronicles.ensureChronicle({
      anchorEntityId: anchor.id,
      locationId: location.id,
      locationName: location.name,
      playerId: TEST_PLAYER_ID,
      title: 'Anchored Chronicle',
    });
    const retrieved = await worldState.chronicles.getChronicle(chronicle.id);

    expect(retrieved?.anchorEntityId).toBe(anchor.id);
  });
});
