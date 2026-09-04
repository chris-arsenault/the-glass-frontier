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
const OFFER_ROOT_NAME = 'Offer Root';
const ASH_SKATER_SLUG = 'encyclopedia:ash-skater';
const ASH_SKATER_TITLE = 'Ash Skater';

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
  it('persists the generated opening separately from the selected seed', async () => {
    const chronicle = await worldState.chronicles.ensureChronicle({
      locationName: 'Opening Test Locale',
      openingText: 'You hear the gantry alarm begin above you.',
      playerId: TEST_PLAYER_ID,
      seedText: 'A gantry alarm interrupts the shift.',
      title: 'Opening Test',
    });

    const reloaded = await worldState.chronicles.getChronicle(chronicle.id);

    expect(reloaded?.openingText).toBe('You hear the gantry alarm begin above you.');
    expect(reloaded?.seedText).toBe('A gantry alarm interrupts the shift.');
  });

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
      kind: 'geographic_location',
      name: 'Atlas Landing',
      status: 'known',
      subkind: 'settlement',
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
      kind: 'geographic_location',
      name: 'Departure Point',
      status: 'known',
      subkind: 'settlement',
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
      kind: 'geographic_location',
      minProminence: 'forgotten',
    });
    expect(canon.map((entity) => entity.name)).toEqual(['Departure Point']);
  });
});

describe('Chronicle wrap target', () => {
  it('sets and clears targetEndTurn without touching other fields', async () => {
    const seedText = 'A short run.';
    const chronicle = await worldState.chronicles.ensureChronicle({
      characterId: undefined,
      locationName: 'Wrap Test Locale',
      playerId: TEST_PLAYER_ID,
      seedText,
      title: 'Wrap Test',
    });

    const withTarget = await worldState.chronicles.setChronicleTargetEnd(chronicle.id, 7);
    expect(withTarget.targetEndTurn).toBe(7);
    expect(withTarget.seedText).toBe(seedText);

    const cleared = await worldState.chronicles.setChronicleTargetEnd(chronicle.id, null);
    expect(cleared.targetEndTurn).toBeUndefined();

    const reloaded = await worldState.chronicles.getChronicle(chronicle.id);
    expect(reloaded?.targetEndTurn).toBeUndefined();
    expect(reloaded?.seedText).toBe(seedText);
  });

  it('rejects an unknown chronicle', async () => {
    await expect(
      worldState.chronicles.setChronicleTargetEnd(
        '00000000-0000-4000-8000-000000000000',
        3
      )
    ).rejects.toThrow('not found');
  });
});

describe('Chronicle tone', () => {
  it('persists the tone chosen at creation', async () => {
    const chronicle = await worldState.chronicles.ensureChronicle({
      characterId: undefined,
      locationName: 'Tone Test Locale',
      playerId: TEST_PLAYER_ID,
      title: 'Tone Test',
      toneChips: ['gritty', 'somber'],
      toneNotes: 'slow-burn dread',
    });

    const reloaded = await worldState.chronicles.getChronicle(chronicle.id);
    expect(reloaded?.toneChips).toEqual(['gritty', 'somber']);
    expect(reloaded?.toneNotes).toBe('slow-burn dread');
  });
});

describe('Chronicle turn history', () => {
  it('creates characters and chronicles with turn history', async () => {
    const startingLocation = await seedEntity(worldState, {
      kind: 'geographic_location',
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
    expect(turn.canBranch).toBe(true);
    expect(turn.turnSequence).toBe(0);
    expect(snapshot?.turns).toHaveLength(1);
    expect(snapshot?.character?.id).toBe(character.id);
    expect(snapshot?.locationName).toBe(startingLocation.name);
  });

  it('branches an active chronicle from an exact checkpoint without copying its character', async () => {
    const character = await worldState.chronicles.upsertCharacter(defaultCharacter());
    const source = await worldState.chronicles.upsertChronicle(
      defaultChronicle('The Start', {
        characterId: character.id,
        targetEndTurn: 8,
        title: 'Branching Test',
      })
    );
    const firstState = { ...source, locationName: 'First Landing' };
    const secondState = {
      ...firstState,
      focusedThreadId: 'reach_second_landing',
      locationName: 'Second Landing',
      threads: [
        {
          goal: 'Reach the second landing.',
          id: 'reach_second_landing',
          owner: character.name,
          perspective: 'player' as const,
          position: 'The character has reached the second landing.',
          title: 'Reach the Second Landing',
          updatedAtTurn: 1,
        },
      ],
    };
    const thirdState = { ...secondState, locationName: 'Third Landing' };

    await worldState.chronicles.commitTurn({
      character: { ...character, momentum: { ...character.momentum, current: 1 } },
      chronicle: firstState,
      turn: defaultTurn(source.id, { gmSummary: 'first', turnSequence: 0 }),
    });
    await worldState.chronicles.commitTurn({
      character: { ...character, momentum: { ...character.momentum, current: -1 } },
      chronicle: secondState,
      turn: defaultTurn(source.id, {
        gmSummary: 'second',
        playerReferenceSlugs: ['atlas:second-landing', ASH_SKATER_SLUG],
        referenceMentions: [{
          end: 10,
          kind: 'creature',
          slug: ASH_SKATER_SLUG,
          start: 0,
          summary: 'A heat-fed skater.',
          title: ASH_SKATER_TITLE,
          transcriptEntryId: 'gm-second',
        }],
        referenceUsage: [{ role: 'interaction', slug: ASH_SKATER_SLUG }],
        turnSequence: 1,
      }),
    });
    await worldState.chronicles.commitTurn({
      character: { ...character, momentum: { ...character.momentum, current: 2 } },
      chronicle: thirdState,
      turn: defaultTurn(source.id, { gmSummary: 'third', turnSequence: 2 }),
    });

    const branch = await worldState.chronicles.branchChronicleFromTurn({
      chronicleId: source.id,
      playerId: TEST_PLAYER_ID,
      turnSequence: 1,
    });
    const [sourceSnapshot, branchSnapshot] = await Promise.all([
      worldState.chronicles.getChronicleState(source.id),
      worldState.chronicles.getChronicleState(branch.id),
    ]);
    if (sourceSnapshot === null || branchSnapshot === null) {
      throw new Error('Expected both source and branch snapshots.');
    }
    if (branchSnapshot.character === null) {
      throw new Error('Expected the branch to resolve its shared character.');
    }

    expect(branch).toMatchObject({
      branch: {
        parentChronicleId: source.id,
        parentTurnSequence: 1,
        rootChronicleId: source.id,
        version: 2,
      },
      characterId: character.id,
      locationName: 'Second Landing',
      status: 'open',
      targetEndTurn: undefined,
      title: 'Branching Test v2',
    });
    expect(sourceSnapshot.turns).toHaveLength(3);
    expect(branchSnapshot.turnSequence).toBe(1);
    expect(branchSnapshot.turns.map((turn) => turn.gmSummary)).toEqual(['first', 'second']);
    expect(branchSnapshot.turns.every((turn) => turn.canBranch === true)).toBe(true);
    expect(branchSnapshot.turns[1]?.playerReferenceSlugs).toEqual([
      'atlas:second-landing',
      ASH_SKATER_SLUG,
    ]);
    expect(branchSnapshot.turns[1]?.referenceUsage).toEqual([
      { role: 'interaction', slug: ASH_SKATER_SLUG },
    ]);
    expect(branchSnapshot.turns[1]?.referenceMentions?.[0]?.title).toBe(ASH_SKATER_TITLE);
    expect(branchSnapshot.turns.map((turn) => turn.id)).not.toEqual(
      sourceSnapshot.turns.slice(0, 2).map((turn) => turn.id)
    );
    expect(branchSnapshot.character.id).toBe(character.id);
    expect(branchSnapshot.character.momentum.current).toBe(2);

    const nextBranch = await worldState.chronicles.branchChronicleFromTurn({
      chronicleId: source.id,
      playerId: TEST_PLAYER_ID,
      turnSequence: 0,
    });
    expect(nextBranch.branch).toMatchObject({ version: 3 });
    expect(nextBranch.title).toBe('Branching Test v3');

    const characterRows = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM character WHERE id = $1::uuid',
      [character.id]
    );
    const sessionCharacterColumns = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'chronicle_session_state' AND column_name = 'character_state'`
    );
    expect(characterRows.rows[0]?.count).toBe('1');
    expect(sessionCharacterColumns.rowCount).toBe(0);

    await worldState.chronicles.upsertChronicle({ ...thirdState, status: 'closed' });
    await expect(
      worldState.chronicles.branchChronicleFromTurn({
        chronicleId: source.id,
        playerId: TEST_PLAYER_ID,
        turnSequence: 1,
      })
    ).rejects.toThrow('Only active chronicles can be branched.');
  });

  it('persists the turn roster, resolved references, and GM usage', async () => {
    const location = await seedEntity(worldState, {
      kind: 'geographic_location',
      name: OFFER_ROOT_NAME,
      status: 'known',
      subkind: 'region',
    });
    const chronicle = await worldState.chronicles.upsertChronicle(defaultChronicle(location.name));
    await commitChronicleTurn(
      worldState,
      chronicle,
      defaultTurn(chronicle.id, {
        entityReferences: [
          {
            confidence: 1,
            entityId: location.id,
            entitySlug: location.slug,
            method: 'exact',
            span: { end: 10, start: 0, text: OFFER_ROOT_NAME },
            speaker: 'player',
            transcriptEntryId: 'player-message',
          },
        ],
        entityRoster: [
          {
            availability: ['location'],
            description: undefined,
            id: location.id,
            kind: 'geographic_location',
            name: OFFER_ROOT_NAME,
            slug: location.slug,
            status: 'known',
            subkind: 'region',
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
        playerReferenceSlugs: [`atlas:${location.slug}`, ASH_SKATER_SLUG],
        referenceMentions: [{
          end: 10,
          kind: 'creature',
          slug: ASH_SKATER_SLUG,
          start: 0,
          summary: 'A heat-fed skater.',
          title: ASH_SKATER_TITLE,
          transcriptEntryId: 'gm-message',
        }],
        referenceUsage: [{ role: 'texture', slug: ASH_SKATER_SLUG }],
        turnSequence: 0,
      })
    );

    const turns = await worldState.chronicles.listChronicleTurns(chronicle.id);
    expect(turns).toMatchObject([{
      entityReferences: [{ entityId: location.id }],
      entityRoster: [{ slug: location.slug }],
      entityUsage: [{ usage: 'central' }],
      playerReferenceSlugs: [`atlas:${location.slug}`, ASH_SKATER_SLUG],
      referenceMentions: [{ title: ASH_SKATER_TITLE }],
      referenceUsage: [{ role: 'texture', slug: ASH_SKATER_SLUG }],
    }]);
  });

});

describe('Chronicle retrieval', () => {
  it('ensures chronicle retrieval respects the most recent turn ordering', async () => {
    const location = await seedEntity(worldState, {
      kind: 'geographic_location',
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
      kind: 'geographic_location',
      name: 'Anchor Site',
      status: 'known',
      subkind: 'settlement',
    });
    const location = await seedEntity(worldState, {
      kind: 'geographic_location',
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

describe('Chronicle activity', () => {
  it('adds open chronicles only when the caller enables member activity', async () => {
    const character = await worldState.chronicles.upsertCharacter(defaultCharacter());
    const active = await worldState.chronicles.upsertChronicle(
      defaultChronicle('Open Reach', {
        characterId: character.id,
        title: 'Still Running',
      })
    );
    const closed = await worldState.chronicles.upsertChronicle(
      defaultChronicle('Closed Reach', {
        characterId: character.id,
        status: 'closed',
        summaries: [
          {
            createdAt: 1,
            id: 'summary-1',
            kind: 'chronicle_story',
            summary: 'The reach fell quiet.',
          },
        ],
        title: 'Finished Run',
      })
    );

    const freeActivity = await worldState.chronicles.listChronicleActivity(false);
    const memberActivity = await worldState.chronicles.listChronicleActivity(true);

    expect(freeActivity).toHaveLength(1);
    expect(freeActivity[0]).toMatchObject({
      characterName: character.name,
      hook: 'The reach fell quiet.',
      id: closed.id,
      locationName: 'Closed Reach',
      status: 'closed',
      title: 'Finished Run',
    });
    expect(memberActivity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          characterName: character.name,
          hook: null,
          id: active.id,
          locationName: 'Open Reach',
          status: 'open',
          title: 'Still Running',
        }),
        expect.objectContaining({ id: closed.id, status: 'closed' }),
      ])
    );
  });
});

describe('Founding threads', () => {
  it('creates the player and world directions supplied by the seed', async () => {
    const chronicle = await worldState.chronicles.ensureChronicle({
      locationName: 'Seeded Reach',
      playerGoal: 'Learn why the convoy vanished.',
      playerId: TEST_PLAYER_ID,
      seedText: 'A convoy vanishes between relays; someone must learn why.',
      title: 'The Vanished Convoy',
      worldThread: {
        goal: 'Conceal the missing cargo.',
        owner: 'The relay factor',
        position: 'The manifests still appear complete.',
        title: 'Falsified manifests',
      },
    });

    expect(chronicle.threads).toEqual([
      expect.objectContaining({
        goal: 'Learn why the convoy vanished.',
        perspective: 'player',
        title: 'The Vanished Convoy',
      }),
      expect.objectContaining({
        owner: 'The relay factor',
        perspective: 'world',
        title: 'Falsified manifests',
      }),
    ]);
    expect(chronicle.focusedThreadId).toBe(chronicle.threads[0]?.id);
  });

  it('creates no thread without seed directions', async () => {
    const chronicle = await worldState.chronicles.ensureChronicle({
      locationName: 'Bare Reach',
      playerId: TEST_PLAYER_ID,
      title: 'Unseeded',
    });

    expect(chronicle.threads).toEqual([]);
    expect(chronicle.focusedThreadId).toBeNull();
  });
});
