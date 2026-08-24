import type { ContextSliceEntity, ContextSliceInput } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { buildEntityContext } from '../src/entity/entitySelector';
import type { GraphContext } from '../src/types';
import { buildContext } from './harness';

const LOCATION_ID = '11111111-2222-4333-8444-555555555555';
const ANCHOR_ID = '99999999-8888-4777-8666-555555555555';
const SUBJECT_ID = '77777777-6666-4555-8444-333333333333';
const ARTICLE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const NPC_ID = '12345678-1234-4234-8234-123456789abc';

const entity = (
  id: string,
  name: string,
  options: Partial<ContextSliceEntity> = {}
): ContextSliceEntity => ({
  facts: {},
  gmNotes: [],
  hops: 1,
  id,
  kind: 'npc',
  lore: [],
  name,
  prominence: 'recognized',
  reach: 0.8,
  score: 1,
  slug: name.toLowerCase().replaceAll(' ', '-'),
  subkind: 'worker',
  tags: [],
  unwritten: false,
  ...options,
});

const stubWorldStore = (options: {
  locationId: string | null;
  slice?: ContextSliceEntity[];
}): { sliceInputs: ContextSliceInput[]; store: GraphContext['worldSchemaStore'] } => {
  const sliceInputs: ContextSliceInput[] = [];
  const store = {
    findLocationByName: ({ name }: { name: string }) =>
      Promise.resolve(
        options.locationId === null
          ? null
          : { id: options.locationId, name }
      ),
    getContextSlice: (input: ContextSliceInput) => {
      sliceInputs.push(input);
      return Promise.resolve(options.slice ?? []);
    },
  } as unknown as GraphContext['worldSchemaStore'];
  return { sliceInputs, store };
};

describe('buildEntityContext', () => {
  it('seeds retrieval from the current location when its name matches canon', async () => {
    const { sliceInputs, store } = stubWorldStore({ locationId: LOCATION_ID });
    const context = buildContext({ worldSchemaStore: store });
    context.chronicleState.chronicle.anchorEntityId = ANCHOR_ID;

    const result = await buildEntityContext(context);

    expect(result.focusEntities).toContain(ANCHOR_ID);
    expect(result.focusEntities).toContain(LOCATION_ID);
    expect(sliceInputs[0]?.focusIds).toContain(LOCATION_ID);
    expect(sliceInputs[0]?.minProminence).toBe('marginal');
  });

  it('falls back to anchor and focus scores when the name is unknown to canon', async () => {
    const { sliceInputs, store } = stubWorldStore({ locationId: null });
    const context = buildContext({ worldSchemaStore: store });
    context.chronicleState.chronicle.anchorEntityId = ANCHOR_ID;

    const result = await buildEntityContext(context);

    expect(result.focusEntities).toEqual([ANCHOR_ID]);
    expect(sliceInputs).toHaveLength(1);
  });

  it('offers an eligible chronicle anchor', async () => {
    const anchor = entity(ANCHOR_ID, 'Bell Salve', {
      kind: 'resource',
      subkind: 'medicine',
    });
    const { store } = stubWorldStore({ locationId: LOCATION_ID, slice: [anchor] });
    const context = buildContext({ worldSchemaStore: store });
    context.chronicleState.chronicle.anchorEntityId = ANCHOR_ID;

    const result = await buildEntityContext(context);

    expect(result.offered.map((entry) => entry.id)).toEqual([ANCHOR_ID]);
    expect(result.roster[0]?.availability).toContain('anchor');
  });

  it('seeds retrieval from a resolved scene subject', async () => {
    const { sliceInputs, store } = stubWorldStore({ locationId: null });
    const context = buildContext({
      effectiveScene: {
        id: 'scene:turn-1',
        progress: 0,
        progressTarget: 4,
        startedAtTurn: 1,
        subject: 'Amaya Venn',
        subjectEntityId: SUBJECT_ID,
        subjectKind: 'npc',
        type: 'dialog',
      },
      worldSchemaStore: store,
    });

    const result = await buildEntityContext(context);

    expect(result.focusEntities).toEqual([SUBJECT_ID]);
    expect(sliceInputs[0]?.focusIds).toContain(SUBJECT_ID);
    expect(sliceInputs[0]?.anchorId).toBe(SUBJECT_ID);
  });

  it('does not let the previous roster seed the next scene selection', async () => {
    const { sliceInputs, store } = stubWorldStore({ locationId: LOCATION_ID });
    const context = buildContext({ worldSchemaStore: store });
    context.chronicleState.chronicle.entityRoster.entries = [{
      availability: ['connected'],
      id: ARTICLE_ID,
      kind: 'species',
      name: 'Humans',
      slug: 'humans',
      subkind: 'sapient_species',
    }];

    await buildEntityContext(context);

    expect(sliceInputs[0]?.focusIds).not.toContain(ARTICLE_ID);
  });

  it('keeps broad canon resolvable without proactively offering it', async () => {
    const humans = entity(ARTICLE_ID, 'Humans', {
      kind: 'species', score: 10, subkind: 'sapient_species',
    });
    const worker = entity(NPC_ID, 'K Vara');
    const { store } = stubWorldStore({ locationId: LOCATION_ID, slice: [humans, worker] });
    const context = buildContext({ worldSchemaStore: store });
    context.chronicleState.chronicle.entityRoster.entries = [{
      availability: ['connected'],
      id: ARTICLE_ID,
      kind: 'species',
      name: 'Humans',
      slug: 'humans',
      subkind: 'sapient_species',
    }];

    const result = await buildEntityContext(context);

    expect(result.candidates.map((entry) => entry.id)).toContain(ARTICLE_ID);
    expect(result.offered.map((entry) => entry.id)).toEqual([NPC_ID]);
  });

  it('offers nothing when there is no anchor, focus, or known location', async () => {
    const { sliceInputs, store } = stubWorldStore({ locationId: null });
    const context = buildContext({ worldSchemaStore: store });

    const result = await buildEntityContext(context);

    expect(result.offered).toEqual([]);
    expect(sliceInputs).toHaveLength(0);
  });
});
