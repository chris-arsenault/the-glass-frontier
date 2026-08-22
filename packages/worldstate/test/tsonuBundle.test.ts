import { describe, expect, it } from 'vitest';

import { buildTsonuProposal, type TsonuBundle, type TsonuEntry } from '../src/tsonuBundle';

const entry = (overrides: Partial<TsonuEntry> & { id: string }): TsonuEntry => ({
  aliases: [],
  connections: [],
  facts: [],
  kind: 'installation',
  prominence: 'marginal',
  sections: [],
  subkind: 'settlement',
  summary: null,
  tags: [],
  title: overrides.id,
  ...overrides,
});

const bundle = (entries: TsonuEntry[]): TsonuBundle => ({
  entries: Object.fromEntries(entries.map((each) => [each.id, { entry: each }])),
  revision: 'abc123',
});

const RATTLE_KEY = 'tsonu:rattle';
const RAVEL_KEY = 'tsonu:ravel';

describe('buildTsonuProposal', () => {
  it('maps an entry to an entity with prefixed external key and flattened facts', () => {
    const proposal = buildTsonuProposal(
      bundle([
        entry({
          aliases: ['Exchange C'],
          facts: [
            { id: 'population', value: 3500 },
            { id: 'role', value: 'Sorting deck' },
            { id: 'locations', links: [{ title: 'The Glass Frontier' }, { title: 'Carom' }] },
            { id: 'maintained_by', value: null },
          ],
          id: 'rattle',
          prominence: 'marginal',
          summary: 'The largest sorting deck.',
          title: 'Rattle',
        }),
      ])
    );

    expect(proposal.source).toBe('import');
    expect(proposal.sourceId).toBe('tsonu-canon@abc123');
    expect(proposal.entities).toEqual([
      {
        description: 'The largest sorting deck.',
        externalKey: RATTLE_KEY,
        facts: {
          aka: 'Exchange C',
          locations: 'The Glass Frontier, Carom',
          population: 3500,
          role: 'Sorting deck',
        },
        kind: 'installation',
        name: 'Rattle',
        prominence: 'marginal',
        subkind: 'settlement',
      },
    ]);
  });

  it('omits facts, description, and prominence when the entry has none', () => {
    const proposal = buildTsonuProposal(bundle([entry({ id: 'bare', prominence: null })]));

    expect(proposal.entities[0]).toEqual({
      externalKey: 'tsonu:bare',
      kind: 'installation',
      name: 'bare',
      subkind: 'settlement',
    });
  });

  it('drops the kind-named default subkind the bundle stamps on undeclared entries', () => {
    const proposal = buildTsonuProposal(
      bundle([entry({ id: 'plain', kind: 'incident', prominence: null, subkind: 'incident' })])
    );

    expect(proposal.entities[0]).toEqual({
      externalKey: 'tsonu:plain',
      kind: 'incident',
      name: 'plain',
    });
  });

  it('turns owned prose sections into lore fragments keyed by section and position', () => {
    const proposal = buildTsonuProposal(
      bundle([
        entry({
          id: 'ravel',
          sections: [
            { format: 'prose', heading: null, markdown: 'First.', owner_id: 'ravel', section: 'main' },
            { format: 'prose', heading: null, markdown: 'Second.', owner_id: 'ravel', section: 'main' },
            { format: 'prose', heading: 'Webs', markdown: 'Webs prose.', owner_id: 'ravel', section: 'structure' },
            { format: 'cards', heading: null, markdown: '', owner_id: 'ravel', section: 'main' },
          ],
          tags: ['orbital'],
          title: 'Ravel',
        }),
      ])
    );

    expect(proposal.lore).toEqual([
      {
        entity: { externalKey: RAVEL_KEY },
        externalKey: 'tsonu:ravel:main:0',
        prose: 'First.',
        tags: ['orbital'],
        title: 'Ravel',
      },
      {
        entity: { externalKey: RAVEL_KEY },
        externalKey: 'tsonu:ravel:main:1',
        prose: 'Second.',
        tags: ['orbital'],
        title: 'Ravel',
      },
      {
        entity: { externalKey: RAVEL_KEY },
        externalKey: 'tsonu:ravel:structure:0',
        prose: 'Webs prose.',
        tags: ['orbital'],
        title: 'Webs',
      },
    ]);
  });

  it('skips prose another entry owns and keeps relation-owned prose keyed by owner', () => {
    const proposal = buildTsonuProposal(
      bundle([
        entry({
          id: 'kite_sail',
          sections: [
            {
              format: 'prose',
              heading: null,
              markdown: 'Transcluded from the incident.',
              owner_id: 'kite_sail_development',
              section: 'main',
            },
            {
              format: 'prose',
              heading: null,
              markdown: 'Edge prose.',
              owner_id: 'rel_kite_depends_on_resonance',
              section: 'main',
            },
          ],
          title: 'Kite Sail',
        }),
        entry({ id: 'kite_sail_development', kind: 'incident', subkind: 'discovery' }),
      ])
    );

    expect(proposal.lore).toEqual([
      {
        entity: { externalKey: 'tsonu:kite_sail' },
        externalKey: 'tsonu:kite_sail:rel_kite_depends_on_resonance',
        prose: 'Edge prose.',
        tags: [],
        title: 'Kite Sail',
      },
    ]);
  });

  it('maps outgoing connections to relationships, skipping incoming and structural ones', () => {
    const proposal = buildTsonuProposal(
      bundle([
        entry({
          connections: [
            { direction: 'outgoing', entry_id: 'carom', from: 2305, relation: 'located_in' },
            { direction: 'outgoing', entry_id: 'carom', from: 2400, relation: 'supplies', to: 2420 },
            { direction: 'outgoing', entry_id: 'carom', from: 2000, relation: 'embeds' },
            { direction: 'incoming', entry_id: 'nera_doss', from: 2435, relation: 'operates_in' },
          ],
          id: 'rattle',
          title: 'Rattle',
        }),
        entry({ id: 'carom', title: 'Carom' }),
      ])
    );

    expect(proposal.relationships).toEqual([
      { dst: { externalKey: 'tsonu:carom' }, relationship: 'located_in', since: 2305, src: { externalKey: RATTLE_KEY } },
      { dst: { externalKey: 'tsonu:carom' }, relationship: 'supplies', since: 2400, src: { externalKey: RATTLE_KEY }, until: 2420 },
    ]);
  });

  it('orders entities by id so regeneration diffs stay stable', () => {
    const proposal = buildTsonuProposal(bundle([entry({ id: 'zephyr' }), entry({ id: 'anvil' })]));

    expect(proposal.entities.map((each) => each.externalKey)).toEqual(['tsonu:anvil', 'tsonu:zephyr']);
  });
});
