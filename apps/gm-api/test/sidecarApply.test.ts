import type { HardState, ProseSidecarEntry, TranscriptEntry } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { applySidecar } from '../src/entity/sidecarApply';
import type { GraphContext } from '../src/types';
import { buildContext } from './harness';

const ENTITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENTITY: HardState = {
  contextTags: [],
  dm: false,
  facts: {},
  id: ENTITY_ID,
  kind: 'npc',
  links: [],
  name: 'Korvath',
  prominence: 'recognized',
  slug: 'korvath-dockmaster',
  veiled: false,
} as unknown as HardState;
const SIDECAR: ProseSidecarEntry[] = [{
  emergentTags: [],
  entityId: ENTITY_ID,
  entitySlug: ENTITY.slug,
  usage: 'central',
}];

const context = (): GraphContext => buildContext({
  worldSchemaStore: {
    listEntitiesByIds: () => Promise.resolve([ENTITY]),
    listTagsByEntities: () => Promise.resolve(new Map([[ENTITY_ID, ['dock']]])),
  } as unknown as GraphContext['worldSchemaStore'],
});

const response = (content: string): TranscriptEntry => ({
  content,
  id: 'gm-response',
  metadata: { tags: [], timestamp: 1 },
  role: 'gm',
});

describe('applySidecar', () => {
  it('persists usage only when the final narration names the served entity', async () => {
    const used = await applySidecar(
      context(),
      SIDECAR,
      response('Korvath shuts the tithe ledger and looks up.')
    );
    const unused = await applySidecar(
      context(),
      SIDECAR,
      response('The dockmaster shuts the tithe ledger and looks up.')
    );

    expect(used.entityUsage).toHaveLength(1);
    expect(used.entityReferences?.at(-1)?.speaker).toBe('gm');
    expect(unused.entityUsage).toEqual([]);
    expect(unused.entityReferences).toEqual([]);
  });
});
