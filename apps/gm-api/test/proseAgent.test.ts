import type { HardState } from '@glass-frontier/dto';
import { AgentLoopClient } from '@glass-frontier/llm-client';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { runProseAgent } from '../src/proseAgent';
import { PANEL_MODELS, runProseAgentPanel } from '../src/proseAgent/panel';
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
const BUDGET_REMINDER_TEXT = '[reminder] The retrieval budget';
const SONNET_MODEL_ID = 'claude-sonnet-5';

const runTool = async (agentTool: unknown, input: unknown): Promise<string> => {
  const executable = agentTool as { execute: (i: unknown, o: unknown) => Promise<string> };
  return executable.execute(input, {});
};

const freshSession = (): ToolSession =>
  new ToolSession({ finishTool: 'submit_brief', maxSteps: 5, seedEntities: [] });

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

const worldStore = (): GraphContext['worldSchemaStore'] => {
  const all = new Map([[KORVATH_ID, korvath], [GUILD_ID, guild], [HIDDEN_ID, hiddenBroker]]);
  return {
    findEntityCandidates: () => Promise.resolve([]),
    findLocationByName: () => Promise.resolve(null),
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
  it('suppresses repeats, caps results, and reminds about the budget once', () => {
    const session = freshSession();
    const first = session.wrapResult('identity:a', () => 'x'.repeat(40_000));
    expect(first).toContain('[truncated');
    const second = session.wrapResult('identity:a', () => 'never rendered');
    expect(second).toContain('[already provided in round 1]');
    const filler: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      filler.push(session.wrapResult(`identity:filler-${index}`, () => 'x'.repeat(6_000)));
    }
    expect(filler.filter((text) => text.includes(BUDGET_REMINDER_TEXT))).toHaveLength(1);
    // The reminder must name a tool the agent was actually given.
    expect(filler.find((text) => text.includes(BUDGET_REMINDER_TEXT)))
      .toContain('call submit_brief');
    const after = session.wrapResult('identity:z', () => 'short');
    expect(after).not.toContain(BUDGET_REMINDER_TEXT);
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
  it('open returns every identity field and note without being asked for keys', async () => {
    const tools = createProseAgentTools({ context: agentContext(), session: freshSession() });
    const raw = await runTool(tools.open, { slug: KORVATH_SLUG });

    expect(raw).toContain('clipped');
    expect(raw).toContain('wary');
  });

  it('open narrows to lore or to notes when asked', async () => {
    const tools = createProseAgentTools({ context: agentContext(), session: freshSession() });
    const notes = await runTool(tools.open, { include: 'notes', slug: KORVATH_SLUG });
    const lore = await runTool(tools.open, { include: 'lore', slug: KORVATH_SLUG });

    expect(notes).toContain('clipped');
    expect(notes).not.toContain('"lore"');
    expect(lore).toContain('"lore"');
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

  it('search returns corrective guidance when nothing matches', async () => {
    const tools = createProseAgentTools({ context: agentContext(), session: freshSession() });
    const raw = await runTool(tools.search, { query: 'glasshouse' });
    expect(raw).toContain('No canon entity resembles');
    expect(raw).toContain('no canon entry');
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
    expect(raw).toBe('[]');
  });
});

const usage = {
  inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: undefined, total: 100 },
  outputTokens: { reasoning: undefined, text: undefined, total: 20 },
};

type MockGenerateResponse = {
  content: Array<{ input: string; toolCallId: string; toolName: string; type: 'tool-call' }>;
  finishReason: { raw: undefined; unified: 'tool-calls' };
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
  finishReason: { raw: undefined, unified: 'tool-calls' },
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

/** A context whose writer stage returns prose, so the second call resolves. */
const writerContext = (): GraphContext => {
  const context = agentContext();
  context.llm = {
    generate: () => Promise.resolve({
      message: 'Korvath counts the tithe twice before he answers you.',
      requestId: 'req-writer',
      usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
    }),
  } as unknown as GraphContext['llm'];
  return context;
};

describe('prose agent panel', () => {
  it('runs every panel model and drops only the failed ones', async () => {
    const attempted: string[] = [];
    const panelLoop = {
      run: (request: { model: { modelId: string } }) => {
        attempted.push(request.model.modelId);
        return Promise.resolve({
          finishToolInput: briefInput(),
          stepCount: 2,
          usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        });
      },
    } as unknown as AgentLoopClient;
    const alternates = await runProseAgentPanel(writerContext(), panelLoop);
    expect(attempted.sort()).toEqual([...PANEL_MODELS].sort());
    const agentic = alternates.filter((alternate) => !alternate.modelId.includes('one-shot'));
    expect(agentic.map((alternate) => alternate.modelId)).toEqual([...PANEL_MODELS]);
    expect(agentic[0]?.prose).toContain('Korvath counts the tithe');
    expect(agentic.every((alternate) => alternate.costUsd > 0)).toBe(true);
    expect(alternates.some((alternate) => alternate.modelId.includes('one-shot'))).toBe(true);
  });

  it('never throws when every panelist fails', async () => {
    const failingLoop = {
      run: () => Promise.reject(new Error('bedrock unavailable')),
    } as unknown as AgentLoopClient;
    await expect(runProseAgentPanel(agentContext(), failingLoop)).resolves.toEqual([]);
  });
});

describe('runProseAgent', () => {
  it('produces prose with a provenance-checked sidecar', async () => {
    const responses = [
      () => toolCallResponse('open', { slug: KORVATH_SLUG }),
      () => toolCallResponse('submit_brief', briefInput()),
    ];
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
    const agentLoop = new AgentLoopClient({
      budgetManager: null,
      modelFactory: () => mockModel,
      successHandler: null,
    });
    const steps: number[] = [];
    const outcome = await runProseAgent(writerContext(), {
      agentLoop,
      onStep: (step) => steps.push(step.stepNumber),
    });
    expect(outcome.prose).toContain('counts the tithe');
    expect(outcome.brief.present).toContain('Korvath counts the tithe');
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
});
