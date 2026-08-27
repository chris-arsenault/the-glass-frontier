import type { HardState } from '@glass-frontier/dto';
import { AgentLoopClient } from '@glass-frontier/llm-client';
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
const SONNET_MODEL_ID = 'claude-sonnet-5';
const TITHE_COUNTING = 'Korvath counts the tithe';
const SMALL_USAGE = { inputTokens: 50, outputTokens: 30, totalTokens: 80 };

const runTool = async (agentTool: unknown, input: unknown): Promise<string> => {
  const executable = agentTool as { execute: (i: unknown, o: unknown) => Promise<string> };
  return executable.execute(input, {});
};

const freshSession = (): ToolSession => new ToolSession({ seedEntities: [] });

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
    const korvathEntry = pack.toc.find((entry) => entry.slug === KORVATH_SLUG);
    expect(korvathEntry?.noteCount).toBe(3);
    const rendered = JSON.stringify(pack.toc);
    expect(rendered).not.toContain('wary');
    // Field names are as unusable to a chooser as field values are cheap to leak.
    expect(rendered).not.toContain('disposition');
    expect(korvathEntry?.relationships.map((rel) => rel.targetSlug)).toEqual([GUILD_SLUG]);
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
    expect(pack.seedEntities).toStrictEqual([]);
  });
});

describe('prose agent tools', () => {
  it('open returns every identity field and note as labeled text, not JSON', async () => {
    const tools = createProseAgentTools({ context: agentContext(), session: freshSession() });
    const raw = await runTool(tools.open, { slug: KORVATH_SLUG });

    expect(raw).toContain('clipped');
    expect(raw).toContain('wary');
    expect(raw).not.toContain('{"');
  });

  it('open narrows to lore or to notes when asked', async () => {
    const tools = createProseAgentTools({ context: agentContext(), session: freshSession() });
    const notes = await runTool(tools.open, { include: 'notes', slug: KORVATH_SLUG });
    const lore = await runTool(tools.open, { include: 'lore', slug: KORVATH_SLUG });

    expect(notes).toContain('clipped');
    expect(notes).not.toContain('lore:');
    expect(lore).toContain('lore:');
    expect(lore).not.toContain('clipped');
  });

  it('read_relationship returns one edge with its fields', async () => {
    const tools = createProseAgentTools({ context: agentContext(), session: freshSession() });
    const raw = await runTool(tools.read_relationship, {
      slug: KORVATH_SLUG,
      targetSlug: GUILD_SLUG,
    });
    expect(raw).toContain('quarterly tithe');
    expect(raw).toContain('reports_to');
    expect(raw).not.toContain('old grudge');
  });

  it('expand returns index entries without field content, hiding dm targets', async () => {
    const tools = createProseAgentTools({ context: agentContext(), session: freshSession() });
    const raw = await runTool(tools.expand, { slug: KORVATH_SLUG });
    expect(raw).toContain(GUILD_SLUG);
    expect(raw).toContain('notes: 3');
    expect(raw).not.toContain('disposition');
    expect(raw).not.toContain('"');
    expect(raw).not.toContain('relationships');
    expect(raw).not.toContain('hidden-broker');
    expect(raw).not.toContain('wary');
  });

  it('search fails as an error when nothing matches, naming the noise it rejected', async () => {
    const context = agentContext();
    context.worldSchemaStore.findEntityCandidates = () => Promise.resolve([
      { id: KORVATH_ID, kind: 'npc', name: 'Korvath', similarity: 0.29, slug: KORVATH_SLUG },
    ]);
    const tools = createProseAgentTools({ context, session: freshSession() });
    await expect(runTool(tools.search, { query: 'globitz' }))
      .rejects.toThrow(/Nothing in canon matches "globitz".*Korvath/u);
  });

  it('search keeps matches above the similarity floor and reports their score', async () => {
    const context = agentContext();
    context.worldSchemaStore.findEntityCandidates = () => Promise.resolve([
      { id: KORVATH_ID, kind: 'npc', name: 'Korvath', similarity: 0.83, slug: KORVATH_SLUG },
      { id: GUILD_ID, kind: 'faction', name: 'Harbor Guild', similarity: 0.31, slug: GUILD_SLUG },
    ]);
    const tools = createProseAgentTools({ context, session: freshSession() });
    const raw = await runTool(tools.search, { query: 'the dockmaster' });
    expect(raw).toContain(KORVATH_SLUG);
    expect(raw).toContain('0.83');
    expect(raw).not.toContain(GUILD_SLUG);
  });

  it('open and search_history fail as errors on misses, and the record keeps the miss', async () => {
    const context = agentContext();
    context.chronicleStore = {
      searchTurns: () => Promise.resolve([]),
    } as unknown as GraphContext['chronicleStore'];
    const session = freshSession();
    const tools = createProseAgentTools({ context, session });
    await expect(runTool(tools.open, { slug: 'globitz' }))
      .rejects.toThrow('No canon entity with slug "globitz"');
    await expect(runTool(tools.search_history, { query: 'globitz' }))
      .rejects.toThrow('No past turn mentions "globitz"');
    expect(session.renderRecord()).toContain('MISS: No canon entity with slug "globitz"');
    expect(session.callCount).toBe(2);
  });

  it('read_turns reads a fixed window in play order', async () => {
    const context = agentContext();
    context.chronicleStore = {
      listTurnWindow: (input: { fromSequence?: number; toSequence?: number }) => {
        expect(input.fromSequence).toBe(4);
        expect(input.toSequence).toBe(13);
        return Promise.resolve([]);
      },
    } as unknown as GraphContext['chronicleStore'];
    const tools = createProseAgentTools({ context, session: freshSession() });
    const raw = await runTool(tools.read_turns, { fromSequence: 4 });
    expect(raw).toBe('');
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
  entities: [
    { emergentTags: ['tithe'], entitySlug: KORVATH_SLUG, usage: 'central' },
    { emergentTags: [], entitySlug: 'never-served-slug', usage: 'mentioned' },
  ],
  history: null,
  location: 'The tithe yards, where every crate is counted twice before dark.',
  present: 'Korvath counts the tithe, wanting it settled before dark.',
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
  extractFails?: boolean;
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
        const verdicts = options?.verdicts ?? [{ gaps: [], status: 'sufficient' as const }];
        const verdict = verdicts[Math.min(verdictIndex, verdicts.length - 1)];
        verdictIndex += 1;
        return Promise.resolve({ data: verdict, rawResponse: {}, usage: SMALL_USAGE });
      }
      if (options?.extractFails === true) {
        return Promise.reject(new Error('extraction failed'));
      }
      return Promise.resolve({ data: briefInput(), rawResponse: {}, usage: SMALL_USAGE });
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

describe('prose agent panel', () => {
  it('is one retrieval-free response on the player\'s own prose model', async () => {
    const context = agentContext();
    context.llm = llmStub();
    const alternates = await runProseAgentPanel(context);

    // Varying the model as well as the context measured Nova, not retrieval.
    expect(alternates).toHaveLength(1);
    expect(alternates[0]?.modelId).toBe(`${SONNET_MODEL_ID} (one-shot)`);
    expect(alternates[0]?.stepCount).toBe(1);
    expect(alternates[0]?.costUsd).toBeGreaterThan(0);
  });

  it('drops its response rather than failing the turn', async () => {
    const context = agentContext();
    context.llm = llmStub();
    context.playerIntent = undefined;

    await expect(runProseAgentPanel(context)).resolves.toEqual([]);
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
  it('researches, composes, extracts, and writes with a provenance-checked sidecar', async () => {
    const agentLoop = scriptedLoop([
      () => toolCallResponse('open', { slug: KORVATH_SLUG }),
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
  });
});
