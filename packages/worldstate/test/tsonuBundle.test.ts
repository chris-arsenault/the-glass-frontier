import { describe, expect, it } from 'vitest';

import { buildTsonuProposal, type TsonuBundle, type TsonuEntry } from '../src/tsonuBundle';

const entry = (overrides: Partial<TsonuEntry> & { id: string }): TsonuEntry => ({
  aliases: [],
  connections: [],
  dm: false,
  facts: [],
  is_article: false,
  kind: 'installation',
  playable_as: [],
  prominence: 'marginal',
  sections: [],
  subkind: 'settlement',
  summary: null,
  tags: [],
  title: overrides.id,
  veiled: false,
  ...overrides,
});

const bundle = (entries: TsonuEntry[]): TsonuBundle => ({
  entries: Object.fromEntries(entries.map((each) => [each.id, { entry: each }])),
  revision: 'abc123',
  schema_version: 6,
});

const CAROM_KEY = 'tsonu:carom';
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
        dm: false,
        externalKey: RATTLE_KEY,
        facts: {
          aka: 'Exchange C',
          locations: 'The Glass Frontier, Carom',
          population: 3500,
          role: 'Sorting deck',
        },
        isArticle: false,
        kind: 'installation',
        name: 'Rattle',
        playableAs: [],
        prominence: 'marginal',
        subkind: 'settlement',
        veiled: false,
      },
    ]);
  });

  it('omits facts, description, and prominence when the entry has none', () => {
    const proposal = buildTsonuProposal(
      bundle([entry({ id: 'bare', origin_blurb: false, prominence: null })])
    );

    expect(proposal.entities[0]).toEqual({
      dm: false,
      externalKey: 'tsonu:bare',
      isArticle: false,
      kind: 'installation',
      name: 'bare',
      playableAs: [],
      subkind: 'settlement',
      veiled: false,
    });
  });

  it('drops the kind-named default subkind the bundle stamps on undeclared entries', () => {
    const proposal = buildTsonuProposal(
      bundle([entry({ id: 'plain', kind: 'incident', prominence: null, subkind: 'incident' })])
    );

    expect(proposal.entities[0]).toEqual({
      dm: false,
      externalKey: 'tsonu:plain',
      isArticle: false,
      kind: 'incident',
      name: 'plain',
      playableAs: [],
      veiled: false,
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

  it('maps outgoing connections to relationships, skipping incoming and inheritance ones', () => {
    const proposal = buildTsonuProposal(
      bundle([
        entry({
          connections: [
            { direction: 'outgoing', entry_id: 'carom', from: 2305, live: true, relation: 'located_in' },
            { direction: 'outgoing', entry_id: 'carom', from: 2400, live: false, relation: 'supplies', to: 2420 },
            { direction: 'outgoing', entry_id: 'carom', from: 2000, live: true, relation: 'embeds' },
            { direction: 'incoming', entry_id: 'nera_doss', from: 2435, live: true, relation: 'operates_in' },
          ],
          id: 'rattle',
          title: 'Rattle',
        }),
        entry({ id: 'carom', title: 'Carom' }),
      ])
    );

    expect(proposal.relationships).toEqual([
      { dst: { externalKey: CAROM_KEY }, live: true, relationship: 'located_in', since: 2305, src: { externalKey: RATTLE_KEY } },
      { dst: { externalKey: CAROM_KEY }, live: false, relationship: 'supplies', since: 2400, src: { externalKey: RATTLE_KEY }, until: 2420 },
      { dst: { externalKey: CAROM_KEY }, live: true, relationship: 'embeds', since: 2000, src: { externalKey: RATTLE_KEY } },
    ]);
  });

  it('maps canon selection and veiled metadata without deriving it from kind', () => {
    const proposal = buildTsonuProposal(bundle([
      entry({
        id: 'guide',
        origin_blurb: 'Raised among the route bells.',
        playable_as: ['culture'],
      }),
      entry({
        dm: true,
        id: 'reference',
        is_article: true,
      }),
      entry({
        id: 'walker',
        veil_tagline: 'A guide follows the old route bells.',
        veiled: true,
      }),
    ]));

    expect(proposal.entities[0]).toMatchObject({
      originBlurb: 'Raised among the route bells.',
      playableAs: ['culture'],
    });
    expect(proposal.entities[1]).toMatchObject({
      dm: true,
      isArticle: true,
    });
    expect(proposal.entities[2]).toMatchObject({
      veiled: true,
      veilTagline: 'A guide follows the old route bells.',
    });
  });

  it('rejects a bundle from before canon metadata became required', () => {
    expect(() => buildTsonuProposal({ ...bundle([]), schema_version: 5 })).toThrow(
      'does not include canon metadata'
    );
  });

  it('orders entities by id so regeneration diffs stay stable', () => {
    const proposal = buildTsonuProposal(bundle([entry({ id: 'zephyr' }), entry({ id: 'anvil' })]));

    expect(proposal.entities.map((each) => each.externalKey)).toEqual(['tsonu:anvil', 'tsonu:zephyr']);
  });
});
