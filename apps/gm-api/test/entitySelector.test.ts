import type { ContextSliceInput } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { buildEntityContext } from '../src/entity/entitySelector';
import type { GraphContext } from '../src/types';
import { buildContext } from './harness';

const LOCATION_ID = '11111111-2222-4333-8444-555555555555';
const ANCHOR_ID = '99999999-8888-4777-8666-555555555555';

const stubWorldStore = (options: {
  locationId: string | null;
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
      return Promise.resolve([]);
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

  it('offers nothing when there is no anchor, focus, or known location', async () => {
    const { sliceInputs, store } = stubWorldStore({ locationId: null });
    const context = buildContext({ worldSchemaStore: store });

    const result = await buildEntityContext(context);

    expect(result.offered).toEqual([]);
    expect(sliceInputs).toHaveLength(0);
  });
});
