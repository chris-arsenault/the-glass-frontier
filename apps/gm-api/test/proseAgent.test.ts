import { MODEL_CATALOG } from '@glass-frontier/app';
import type { EncyclopediaEntry, HardState } from '@glass-frontier/dto';
import { AgentLoopClient, calculateActualCostUsd } from '@glass-frontier/llm-client';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { runProseAgent } from '../src/proseAgent';
import { buildOneShotContext } from '../src/proseAgent/oneShotContext';
import { runProseAgentPanel } from '../src/proseAgent/panel';
import { buildSeedPack } from '../src/proseAgent/seedPack';
import { createProseAgentTools } from '../src/proseAgent/tools';
import { ToolSession } from '../src/proseAgent/toolSession';
import type { GraphContext } from '../src/types';
import { buildContext, buildIntent } from './harness';

const KORVATH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GUILD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HIDDEN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const KORVATH_SLUG = 'korvath-dockmaster';
const GUILD_SLUG = 'harbor-guild';
const FLITTER_SLUG = 'flitter';
const SONNET_MODEL_ID = 'claude-sonnet-5';
const CLASSIFICATION_MODEL_ID = 'amazon-nova-2-lite';
const OSS_MODEL_ID = 'gpt-oss-120b';
const QWEN_MODEL_ID = 'qwen3-32b';
const TITHE_COUNTING = 'Korvath counts the tithe';
const SMALL_USAGE = { inputTokens: 50, outputTokens: 30, totalTokens: 80 };

const runTool = async (agentTool: unknown, input: unknown): Promise<string> => {
  const executable = agentTool as { execute: (i: unknown, o: unknown) => Promise<string> };
  return executable.execute(input, {});
};

const freshSession = (): ToolSession => new ToolSession({ seedReferences: [] });

const entity = (overrides: Partial<HardState> & { id: string; slug: string }): HardState =>
  ({
    description: 'A watchful dockmaster of the tithe yards. He counts everything twice.',
    descriptiveIdentity: { disposition: 'wary', manner: 'clipped', stakes: 'his post' },
    dm: false,
    facts: { post: 'dockmaster' },
    kind: 'npc',
    links: [],
    name: overrides.slug,
    prominence: 'recognized',
    veiled: false,
    ...overrides,
  }) as unknown as HardState;

const korvath = entity({
  id: KORVATH_ID,
  links: [
    {
      descriptiveIdentity: { cost: 'debts covered', terms: 'quarterly tithe' },
      direction: 'out',
      live: true,
      relationship: 'reports_to',
      targetId: GUILD_ID,
    },
    {
      descriptiveIdentity: { basis: 'old grudge' },
      direction: 'out',
      live: true,
      relationship: 'rival_of',
      targetId: HIDDEN_ID,
    },
  ] as unknown as HardState['links'],
  slug: KORVATH_SLUG,
});
const guild = entity({ id: GUILD_ID, kind: 'faction', slug: GUILD_SLUG });
const hiddenBroker = entity({ dm: true, id: HIDDEN_ID, slug: 'hidden-broker' });

const flitter = (
  overrides: Partial<EncyclopediaEntry & { id: string }> = {}
): EncyclopediaEntry & { id: string } => ({
  aliases: ['glass-wing'],
  availability: { mode: 'global' as const },
  descriptiveIdentity: { motion: 'skittish' },
  dm: false,
  externalKey: 'creature:flitter',
  facts: { diet: 'resonant pollen' },
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  instances: [],
  kind: 'creature',
  members: [],
  prevalence: 'common' as const,
  sections: [{ audience: 'gm' as const, heading: 'Use', text: 'They expose vibration.' }],
  slug: FLITTER_SLUG,
  status: 'complete' as const,
  subkind: 'animal',
  summary: 'A glass-winged scavenger drawn to resonant machinery.',
  tiers: [],
  title: 'Flitter',
  topics: ['resonance'],
  usage: {
    affordances: ['Follow it to active machinery.'],
    cues: ['Glass wings tick against metal.'],
    pressures: [],
    variations: [],
  },
  ...overrides,
});

const encyclopediaStore = (
  overrides: Record<string, unknown> = {}
): GraphContext['encyclopediaStore'] => (({
  findCandidates: () => Promise.resolve([]),
  findMentionedEntries: () => Promise.resolve([]),
  getEntry: ({ slug }: { slug: string }) =>
    Promise.resolve(slug.replace(/^encyclopedia:/u, '') === FLITTER_SLUG ? flitter() : null),
  getEntryById: () => Promise.resolve(flitter()),
  listApplicable: () => Promise.resolve([]),
  listAtlasExamplesForEntry: () => Promise.resolve([]),
  listCharacterOptions: () => Promise.resolve([]),
  listClassificationsForEntity: () => Promise.resolve([]),
  listEntries: () => Promise.resolve([]),
  listMissingEmbeddings: () => Promise.resolve([]),
  saveEmbedding: () => Promise.resolve(),
  ...overrides,
}));

/** One slice row per entity, shaped as the store returns it. */
const sliceRow = (source: HardState, score: number): unknown => ({
  description: source.description,
  descriptiveIdentity: source.descriptiveIdentity,
  facts: source.facts,
  gmNotes: [],
  hops: 1,
  id: source.id,
  kind: source.kind,
  lore: [],
  name: source.name,
  prominence: 'recognized',
  reach: 1,
  score,
  slug: source.slug,
  tags: [],
  unwritten: false,
});

const worldStore = (
  overrides: Record<string, unknown> = {}
): GraphContext['worldSchemaStore'] => {
  const all = new Map([[KORVATH_ID, korvath], [GUILD_ID, guild], [HIDDEN_ID, hiddenBroker]]);
  return {
    findEntitiesByName: () => Promise.resolve([]),
    findEntityCandidates: () => Promise.resolve([]),
    findLocationByName: () => Promise.resolve(null),
    getContextSlice: () => Promise.resolve([sliceRow(korvath, 0.9), sliceRow(guild, 0.4)]),
    getEntityBySlug: ({ slug }: { slug: string }) =>
      Promise.resolve([...all.values()].find((candidate) => candidate.slug === slug) ?? null),
    getLoreFragment: () => Promise.resolve(null),
    listEntitiesByIds: (ids: string[]) =>
      Promise.resolve(ids.flatMap((id) => (all.has(id) ? [all.get(id) as HardState] : []))),
    listEntityStats: (ids: string[]) =>
      Promise.resolve(ids.map((id) => ({ edgeCount: 1, id, loreCount: 3, source: 'seed' }))),
    listLoreFragmentsByEntity: ({ entityId }: { entityId: string }) =>
      Promise.resolve(entityId === KORVATH_ID
        ? [{ prose: 'He turned away the tithe barge twice.', title: 'The Refused Barge' }]
        : []),
    listRelationshipsAmong: () => Promise.resolve([]),
    searchLoreFragments: () => Promise.resolve([]),
    ...overrides,
  } as unknown as GraphContext['worldSchemaStore'];
};

const agentContext = (): GraphContext => {
  const context = buildContext({
    embeddings: { embed: () => Promise.resolve([0.1]) },
    encyclopediaStore: encyclopediaStore(),
    playerIntent: buildIntent(),
    // Korvath reaches the index because this turn names him, not because a
    // scorer put him on a roster — the roster no longer seeds anything.
    targetEntityIds: [KORVATH_ID],
    worldSchemaStore: worldStore(),
  });
  context.chronicleState.chronicle.entityRoster = {
    entries: [{
      availability: ['present'],
      id: KORVATH_ID,
      kind: 'npc',
      name: 'Korvath',
      slug: KORVATH_SLUG,
    }],
    locationName: 'The Splinter Yards',
    sceneId: null,
    updatedAtTurn: 0,
  } as unknown as typeof context.chronicleState.chronicle.entityRoster;
  context.templates = {
    render: () => Promise.resolve('You are the Glass Frontier GM.'),
  } as unknown as GraphContext['templates'];
  context.modelConfigStore = {
    getModelForCategory: () => Promise.resolve(SONNET_MODEL_ID),
  } as unknown as GraphContext['modelConfigStore'];
  return context;
};

describe('tool session', () => {
  it('suppresses repeats, caps results, and keeps the retrieval record', () => {
    const session = freshSession();
    const first = session.wrapResult('open:a:both', () => 'x'.repeat(40_000));
    expect(first).toContain('[truncated');
    const second = session.wrapResult('open:a:both', () => 'never rendered');
    expect(second).toContain('[already provided in round 1]');
    session.recordCall({
      input: '{"slug":"a"}',
      outcome: { result: 'description: a place' },
      tool: 'open',
    });
    session.recordCall({
      input: '{"slug":"globitz"}',
      outcome: { error: 'No canon entity with slug "globitz".' },
      tool: 'open',
    });
    const record = session.renderRecord();
    expect(record).toContain('## open({"slug":"a"})');
    expect(record).toContain('description: a place');
    expect(record).toContain('MISS: No canon entity with slug "globitz".');
    expect(session.callCount).toBe(2);
  });
});

describe('seed pack', () => {
  it('counts what can be opened without naming fields or values', async () => {
    const pack = await buildSeedPack(agentContext());
    const korvathEntry = pack.toc.find((entry) => entry.slug === `atlas:${KORVATH_SLUG}`);
    expect(korvathEntry?.noteCount).toBe(3);
    const rendered = JSON.stringify(pack.toc);
    expect(rendered).not.toContain('wary');
    // Field names are as unusable to a chooser as field values are cheap to leak.
    expect(rendered).not.toContain('disposition');
    expect(korvathEntry?.relationships.map((rel) => rel.targetSlug))
      .toEqual([`atlas:${GUILD_SLUG}`]);
    expect(korvathEntry?.loreCount).toBe(3);
  });

  it('puts the player character first, ahead of the world', async () => {
    const pack = await buildSeedPack(agentContext());
    const named = pack.sections.map((section) => section.name);

    expect(named[0]).toBe('CHARACTER');
    expect(named.indexOf('CHARACTER')).toBeLessThan(named.indexOf('FRONTS'));
  });

  it('leaves roster entries out of the index unless the turn touches them', async () => {
    const context = agentContext();
    context.targetEntityIds = [];
    const pack = await buildSeedPack(context);

    expect(pack.toc).toStrictEqual([]);
    expect(pack.seedReferences).toStrictEqual([]);
  });
});

describe('prose agent tools', () => {
  it('exposes only cross-catalog search and open', () => {
    const tools = createProseAgentTools({ context: agentContext(), session: freshSession() });
    expect(Object.keys(tools).sort()).toEqual(['open', 'search']);
  });

  it('opens a qualified Atlas slug with its full record', async () => {
    const tools = createProseAgentTools({ context: agentContext(), session: freshSession() });
    const raw = await runTool(tools.open, { slug: `atlas:${KORVATH_SLUG}` });

    expect(raw).toContain('clipped');
    expect(raw).toContain('wary');
    expect(raw).toContain('quarterly tithe');
    expect(raw).not.toContain('{"');
  });

  it('opens a qualified Encyclopedia slug without exposing an id or source field', async () => {
    const tools = createProseAgentTools({ context: agentContext(), session: freshSession() });
    const raw = await runTool(tools.open, { slug: `encyclopedia:${FLITTER_SLUG}` });

    expect(raw).toContain('resonant pollen');
    expect(raw).toContain(`encyclopedia:${FLITTER_SLUG}`);
    expect(raw).not.toContain(flitter().id);
    expect(raw).not.toContain('source:');
  });

  it('accepts a bare slug only when it is unique across repositories', async () => {
    const tools = createProseAgentTools({ context: agentContext(), session: freshSession() });
    const raw = await runTool(tools.open, { slug: FLITTER_SLUG });
    expect(raw).toContain(`encyclopedia:${FLITTER_SLUG}`);
  });

  it('returns qualified alternatives for a cross-repository slug collision', async () => {
    const context = agentContext();
    context.encyclopediaStore = encyclopediaStore({
      getEntry: ({ slug }: { slug: string }) => Promise.resolve(
        slug.replace(/^encyclopedia:/u, '') === GUILD_SLUG
          ? flitter({ slug: GUILD_SLUG, title: 'Harbor Guild Practice' })
          : null
      ),
    });
    const tools = createProseAgentTools({ context, session: freshSession() });
    await expect(runTool(tools.open, { slug: GUILD_SLUG })).rejects.toThrow(
      `atlas:${GUILD_SLUG}, encyclopedia:${GUILD_SLUG}`
    );
  });

  it('does not fall through to another repository for a qualified miss', async () => {
    const tools = createProseAgentTools({ context: agentContext(), session: freshSession() });
    await expect(runTool(tools.open, { slug: `atlas:${FLITTER_SLUG}` }))
      .rejects.toThrow(`No reference has slug "atlas:${FLITTER_SLUG}"`);
  });

  it('fails a search miss with the non-exhaustive invention policy', async () => {
    const context = agentContext();
    context.worldSchemaStore.findEntityCandidates = () => Promise.resolve([
      { id: KORVATH_ID, kind: 'npc', name: 'Korvath', similarity: 0.29, slug: KORVATH_SLUG },
    ]);
    const tools = createProseAgentTools({ context, session: freshSession() });
    await expect(runTool(tools.search, { query: 'globitz' }))
      .rejects.toThrow(/Nothing matches "globitz".*treat it as new fiction/u);
  });

  it('returns fully qualified slugs without ids, source fields, or scores', async () => {
    const context = agentContext();
    context.worldSchemaStore.findEntityCandidates = () => Promise.resolve([
      { id: KORVATH_ID, kind: 'npc', name: 'Korvath', similarity: 0.83, slug: KORVATH_SLUG },
      { id: GUILD_ID, kind: 'faction', name: 'Harbor Guild', similarity: 0.31, slug: GUILD_SLUG },
    ]);
    context.encyclopediaStore = encyclopediaStore({
      findCandidates: () => Promise.resolve([{
        kind: 'creature',
        prevalence: 'common',
        similarity: 0.78,
        slug: `encyclopedia:${FLITTER_SLUG}`,
        status: 'complete',
        subkind: 'animal',
        summary: flitter().summary,
        title: 'Flitter',
        topics: ['resonance'],
      }]),
    });
    const tools = createProseAgentTools({ context, session: freshSession() });
    const raw = await runTool(tools.search, { query: 'the dockmaster' });
    expect(raw).toContain(`atlas:${KORVATH_SLUG}`);
    expect(raw).toContain(`encyclopedia:${FLITTER_SLUG}`);
    expect(raw).not.toContain(KORVATH_ID);
    expect(raw).not.toContain('source:');
    expect(raw).not.toContain('0.83');
    expect(raw).not.toContain(`atlas:${GUILD_SLUG}`);
  });

  it('searches Chronicle turns and opens the returned slug unchanged', async () => {
    const context = agentContext();
    context.chronicleStore = {
      listTurnWindow: () => Promise.resolve([{
        gmResponse: { content: 'The relay answered in Vex\'s voice.' },
        playerMessage: { content: 'I call the drowned relay.', role: 'player' },
        turnSequence: 4,
      }]),
      searchTurns: () => Promise.resolve([{
        gmResponse: { content: 'The relay answered in Vex\'s voice.' },
        playerMessage: { content: 'I call the drowned relay.', role: 'player' },
        turnSequence: 4,
      }]),
    } as unknown as GraphContext['chronicleStore'];
    const tools = createProseAgentTools({ context, session: freshSession() });
    const results = await runTool(tools.search, { query: 'drowned relay' });
    expect(results).toContain('chronicle:turn-4');
    const opened = await runTool(tools.open, { slug: 'chronicle:turn-4' });
    expect(opened).toContain('The relay answered');
  });

  it('records misses without exposing another tool surface', async () => {
    const session = freshSession();
    const tools = createProseAgentTools({ context: agentContext(), session });
    await expect(runTool(tools.open, { slug: 'globitz' }))
      .rejects.toThrow('No reference has slug "globitz"');
    expect(session.renderRecord()).toContain('MISS: No reference has slug "globitz"');
    expect(session.callCount).toBe(1);
  });
});

const usage = {
  inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: undefined, total: 100 },
  outputTokens: { reasoning: undefined, text: undefined, total: 20 },
};

type MockContent =
  | { input: string; toolCallId: string; toolName: string; type: 'tool-call' }
  | { text: string; type: 'text' };

type MockGenerateResponse = {
  content: MockContent[];
  finishReason: { raw: undefined; unified: 'stop' | 'tool-calls' };
  usage: typeof usage;
  warnings: [];
};

const toolCallResponse = (
  toolName: string,
  input: Record<string, unknown>
): MockGenerateResponse => ({
  content: [{
    input: JSON.stringify(input),
    toolCallId: `call-${toolName}`,
    toolName,
    type: 'tool-call',
  }],
  finishReason: { raw: undefined, unified: 'tool-calls' as const },
  usage,
  warnings: [],
});

const textResponse = (text: string): MockGenerateResponse => ({
  content: [{ text, type: 'text' as const }],
  finishReason: { raw: undefined, unified: 'stop' as const },
  usage,
  warnings: [],
});

const briefInput = (): Record<string, unknown> => ({
  character: 'A glasswright whose hands answer before their voice does.',
  complication: null,
  history: null,
  location: 'The tithe yards, where every crate is counted twice before dark.',
  present: 'Korvath counts the tithe, wanting it settled before dark.',
  references: [
    { emergentTags: ['tithe'], slug: `atlas:${KORVATH_SLUG}`, usage: 'central' },
    { emergentTags: [], slug: 'atlas:never-served-slug', usage: 'mentioned' },
  ],
  scene: {
    changed: 'nothing yet',
    endsWhen: 'the tithe is settled or refused',
    stakes: 'the tithe',
  },
});

type Verdict = { gaps: string[]; status: 'sufficient' | 'continue' };

/**
 * The llm stages behind the scout — evaluator, composer, extractor, writer —
 * dispatched the way production tells them apart: schema name and node id.
 */
const llmStub = (options?: {
  brief?: Record<string, unknown>;
  extractFails?: boolean;
  verdictFails?: boolean;
  verdicts?: Verdict[];
}): GraphContext['llm'] => {
  let verdictIndex = 0;
  return {
    generate: (request: { metadata?: { nodeId?: string } }) => {
      if (request.metadata?.nodeId === 'scout-composer') {
        return Promise.resolve({
          message: 'CHARACTER:\nA glasswright.\n\nLOCATION:\nThe tithe yards.',
          requestId: 'req-composer',
          usage: SMALL_USAGE,
        });
      }
      return Promise.resolve({
        message: 'Korvath counts the tithe twice before he answers you.',
        requestId: 'req-writer',
        usage: SMALL_USAGE,
      });
    },
    generateStructured: (
      _request: unknown,
      _schema: unknown,
      schemaName: string
    ) => {
      if (schemaName === 'retrieval_verdict_schema') {
        if (options?.verdictFails === true) {
          return Promise.reject(new Error('No toolUse block in Bedrock response.'));
        }
        const verdicts = options?.verdicts ?? [{ gaps: [], status: 'sufficient' as const }];
        const verdict = verdicts[Math.min(verdictIndex, verdicts.length - 1)];
        verdictIndex += 1;
        return Promise.resolve({ data: verdict, rawResponse: {}, usage: SMALL_USAGE });
      }
      if (options?.extractFails === true) {
        return Promise.reject(new Error('extraction failed'));
      }
      return Promise.resolve({
        data: options?.brief ?? briefInput(),
        rawResponse: {},
        usage: SMALL_USAGE,
      });
    },
  } as unknown as GraphContext['llm'];
};

const scriptedLoop = (responses: Array<() => MockGenerateResponse>): AgentLoopClient => {
  let call = 0;
  const mockModel = new MockLanguageModelV4({
    doGenerate: () => {
      const respond = responses.at(call);
      call += 1;
      if (respond === undefined) {
        throw new Error('Mock model ran out of scripted responses.');
      }
      return Promise.resolve(respond());
    },
  });
  return new AgentLoopClient({
    budgetManager: null,
    modelFactory: () => mockModel,
    successHandler: null,
  });
};

/** Stands in for the agentic panelist; the canonical turn is written elsewhere. */
const panelLoop = (): AgentLoopClient => ({
  run: () => Promise.resolve({
    stepCount: 2,
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
  }),
} as unknown as AgentLoopClient);

const slottedContext = (
  slots: Array<{ modelId: string; slot: number }>
): GraphContext => {
  const context = agentContext();
  context.llm = llmStub();
  context.modelConfigStore = {
    getModelForCategory: () => Promise.resolve(SONNET_MODEL_ID),
    listModelsForCategory: () => Promise.resolve(slots),
  } as unknown as GraphContext['modelConfigStore'];
  return context;
};

describe('prose agent panel', () => {
  it('pairs every configured model with itself, minus the canonical turn', async () => {
    const context = slottedContext([
      { modelId: SONNET_MODEL_ID, slot: 1 },
      { modelId: OSS_MODEL_ID, slot: 2 },
      { modelId: QWEN_MODEL_ID, slot: 3 },
    ]);
    const alternates = await runProseAgentPanel(context, panelLoop());

    // Three models, six generations: the primary's agentic response is the
    // turn itself and is not repeated here.
    expect(alternates.map((alternate) => alternate.modelId).sort()).toEqual([
      `${OSS_MODEL_ID} (one-shot)`,
      `${QWEN_MODEL_ID} (one-shot)`,
      `${SONNET_MODEL_ID} (one-shot)`,
      OSS_MODEL_ID,
      QWEN_MODEL_ID,
    ].sort());
  });

  it('runs one comparison when only the primary is configured', async () => {
    const context = slottedContext([{ modelId: SONNET_MODEL_ID, slot: 1 }]);
    const alternates = await runProseAgentPanel(context, panelLoop());

    expect(alternates).toHaveLength(1);
    expect(alternates[0]?.modelId).toBe(`${SONNET_MODEL_ID} (one-shot)`);
    expect(alternates[0]?.costUsd).toBeGreaterThan(0);
  });

  it('keeps a tertiary in its own slot when the secondary is None', async () => {
    const context = slottedContext([
      { modelId: SONNET_MODEL_ID, slot: 1 },
      { modelId: OSS_MODEL_ID, slot: 3 },
    ]);
    const alternates = await runProseAgentPanel(context, panelLoop());

    // A dense list would have promoted the tertiary and skipped its agentic run.
    expect(alternates.map((alternate) => alternate.modelId)).toContain(OSS_MODEL_ID);
  });

  it('drops its response rather than failing the turn', async () => {
    const context = slottedContext([{ modelId: SONNET_MODEL_ID, slot: 1 }]);
    context.playerIntent = undefined;

    await expect(runProseAgentPanel(context, panelLoop())).resolves.toEqual([]);
  });
});

describe('one-shot retrieval', () => {
  it('reaches canon by meaning as well as by graph distance', async () => {
    const focusIds: string[][] = [];
    const context = agentContext();
    context.worldSchemaStore = worldStore({
      findEntityCandidates: () => Promise.resolve([
        { id: GUILD_ID, similarity: 0.71 },
        { id: HIDDEN_ID, similarity: 0.22 },
      ]),
      getContextSlice: (input: { focusIds: string[] }) => {
        focusIds.push(input.focusIds);
        return Promise.resolve([sliceRow(korvath, 0.9), sliceRow(guild, 0.4)]);
      },
    });
    const retrieved = await buildOneShotContext(context);

    // The vector match joins the walk's starting points; the sub-floor one does
    // not, because 0.22 against this index is an invented word.
    expect(focusIds[0]).toContain(GUILD_ID);
    expect(focusIds[0]).not.toContain(HIDDEN_ID);
    expect(retrieved.entityContext.offered.map((entry) => entry.slug))
      .toEqual([KORVATH_SLUG, GUILD_SLUG]);
  });

  it('hands over the edges among what it retrieved', async () => {
    const asked: string[][] = [];
    const context = agentContext();
    context.worldSchemaStore = worldStore({
      listRelationshipsAmong: ({ entityIds }: { entityIds: string[] }) => {
        asked.push(entityIds);
        return Promise.resolve([
          { dstId: GUILD_ID, relationship: 'reports_to', srcId: KORVATH_ID },
        ]);
      },
    });
    const retrieved = await buildOneShotContext(context);

    expect(asked[0]).toEqual([KORVATH_ID, GUILD_ID]);
    expect(retrieved.relationships).toHaveLength(1);
  });

  it('writes from the graph alone when the vector search fails', async () => {
    const context = agentContext();
    context.embeddings = {
      embed: () => Promise.reject(new Error('titan unavailable')),
    };
    const retrieved = await buildOneShotContext(context);

    expect(retrieved.entityContext.offered).not.toHaveLength(0);
  });
});

describe('runProseAgent', () => {
  it('prices classification usage on the classification model', async () => {
    const stubLoop = {
      run: () => Promise.resolve({ stepCount: 1, usage: SMALL_USAGE }),
    } as unknown as AgentLoopClient;
    const context = agentContext();
    context.llm = llmStub();
    context.modelConfigStore = {
      getModelForCategory: (category: string) => Promise.resolve(
        category === 'classification' ? CLASSIFICATION_MODEL_ID : SONNET_MODEL_ID
      ),
    } as unknown as GraphContext['modelConfigStore'];

    const outcome = await runProseAgent(context, { agentLoop: stubLoop });
    const proseModel = MODEL_CATALOG.models.find((model) => model.modelId === SONNET_MODEL_ID);
    const classificationModel = MODEL_CATALOG.models.find(
      (model) => model.modelId === CLASSIFICATION_MODEL_ID
    );
    if (proseModel === undefined || classificationModel === undefined) {
      throw new Error('Expected test models in the catalog.');
    }
    const proseUsage = { inputTokens: 200, outputTokens: 120, totalTokens: 320 };

    expect(outcome.usage).toEqual({ inputTokens: 250, outputTokens: 150, totalTokens: 400 });
    expect(outcome.costUsd).toBe(
      calculateActualCostUsd(proseModel, proseUsage)
      + calculateActualCostUsd(classificationModel, SMALL_USAGE)
    );
  });

  it('researches, composes, extracts, and writes with a provenance-checked sidecar', async () => {
    const agentLoop = scriptedLoop([
      () => toolCallResponse('open', { slug: `atlas:${KORVATH_SLUG}` }),
      () => textResponse('That covers the yard.'),
    ]);
    const context = agentContext();
    context.llm = llmStub();
    const steps: number[] = [];
    const outcome = await runProseAgent(context, {
      agentLoop,
      onStep: (step) => steps.push(step.stepNumber),
    });
    expect(outcome.prose).toContain('counts the tithe');
    expect(outcome.brief.present).toContain(TITHE_COUNTING);
    expect(outcome.sidecar).toEqual([
      {
        emergentTags: ['tithe'],
        entityId: KORVATH_ID,
        entitySlug: KORVATH_SLUG,
        usage: 'central',
      },
    ]);
    expect(outcome.stepCount).toBe(2);
    expect(steps).toEqual([0, 1]);
  });

  it('records served Encyclopedia material without adding it to entity focus', async () => {
    const agentLoop = scriptedLoop([
      () => toolCallResponse('open', { slug: `encyclopedia:${FLITTER_SLUG}` }),
      () => textResponse('That covers the local life.'),
    ]);
    const context = agentContext();
    context.llm = llmStub({
      brief: {
        ...briefInput(),
        references: [{
          emergentTags: [],
          slug: `encyclopedia:${FLITTER_SLUG}`,
          usage: 'central',
        }],
      },
    });

    const outcome = await runProseAgent(context, { agentLoop });

    expect(outcome.referenceUsage).toEqual([{
      role: 'interaction',
      slug: `encyclopedia:${FLITTER_SLUG}`,
    }]);
    expect(outcome.sidecar).toEqual([]);
  });

  it('feeds evaluator gaps into the next search round', async () => {
    const searchMessages: string[] = [];
    const stubLoop = {
      run: (request: { messages: Array<{ content: string }> }) => {
        searchMessages.push(request.messages[0]?.content ?? '');
        return Promise.resolve({
          stepCount: 1,
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        });
      },
    } as unknown as AgentLoopClient;
    const context = agentContext();
    context.llm = llmStub({
      verdicts: [
        { gaps: ['What the chronicle established about the Globitz'], status: 'continue' },
        { gaps: [], status: 'sufficient' },
      ],
    });
    await runProseAgent(context, { agentLoop: stubLoop });
    expect(searchMessages).toHaveLength(2);
    expect(searchMessages[0]).not.toContain('### GAPS');
    expect(searchMessages[1]).toContain('### GAPS');
    expect(searchMessages[1]).toContain('What the chronicle established about the Globitz');
    expect(searchMessages[1]).toContain('### RETRIEVED');
  });

  it('falls back to the empty brief when extraction fails, and still writes', async () => {
    const stubLoop = {
      run: () => Promise.resolve({
        stepCount: 1,
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
    } as unknown as AgentLoopClient;
    const context = agentContext();
    context.llm = llmStub({ extractFails: true });
    const outcome = await runProseAgent(context, { agentLoop: stubLoop });
    expect(outcome.brief.character).toBe('not established this turn');
    expect(outcome.prose).toContain('counts the tithe');
    expect(outcome.sidecar).toEqual([]);
    expect(outcome.briefFailed).toBe(true);
  });

  it('still writes the brief when the judge throws mid-research', async () => {
    const stubLoop = {
      run: () => Promise.resolve({
        stepCount: 2,
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
    } as unknown as AgentLoopClient;
    const context = agentContext();
    // Kimi's evaluator threw on every turn of Warm Argument's ore and took ten
    // tool calls' worth of retrieved canon with it. Research is best-effort;
    // the brief is not.
    context.llm = llmStub({ verdictFails: true });

    const outcome = await runProseAgent(context, { agentLoop: stubLoop });

    expect(outcome.briefFailed).toBe(false);
    expect(outcome.brief.character).not.toBe('not established this turn');
    expect(outcome.stepCount).toBe(2);
  });
});
