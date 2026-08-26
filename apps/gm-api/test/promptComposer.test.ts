import type { PromptTemplateRuntime } from '@glass-frontier/app';
import type { PromptTemplateId } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { PromptComposer } from '../src/prompts/prompts';
import type { GraphContext } from '../src/types';
import { buildContext, buildIntent } from './harness';

const recordingRuntime = (): {
  runtime: PromptTemplateRuntime;
  rendered: Array<{ data: Record<string, unknown>; templateId: PromptTemplateId }>;
} => {
  const rendered: Array<{ data: Record<string, unknown>; templateId: PromptTemplateId }> = [];
  const runtime = {
    render: (templateId: PromptTemplateId, data: Record<string, unknown>) => {
      rendered.push({ data, templateId });
      return Promise.resolve(`instructions:${templateId}`);
    },
  } as unknown as PromptTemplateRuntime;
  return { rendered, runtime };
};

const ACTION_RESOLVER: PromptTemplateId = 'action-resolver';
const RECENT_EVENTS_HEADER = '### RECENT-EVENTS';
const TURN_JUDGE = 'turn-judge';
const CHECKPOINT_NARRATION = 'Vex slipped past the checkpoint.';
const ENTITIES_HEADER = '### ENTITIES';
const SHELL_NAME = 'Alen Dorath';
const SHELL_SLUG = 'alen-dorath';

const textOf = (message: { content: Array<{ text: string }> }): string =>
  message.content.map((part) => part.text).join('');

describe('PromptComposer', () => {
  it('renders instructions statically', async () => {
    const { rendered, runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const context = buildContext({ playerIntent: buildIntent() });

    const prompt = await composer.buildPrompt(ACTION_RESOLVER, context);

    expect(prompt.instructions).toContain('instructions:action-resolver');
    expect(prompt.instructions).toContain('no entity must appear');
    expect(rendered[0]?.data).toEqual({});
  });

  it('assembles the player message plus developer fragments for narration prompts', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const context = buildContext({ playerIntent: buildIntent() });

    const prompt = await composer.buildPrompt(ACTION_RESOLVER, context);

    expect(prompt.input[0]?.role).toBe('user');
    expect(textOf(prompt.input[0])).toBe('I pry the access panel open.');
    const developer = textOf(prompt.input.at(-1)!);
    expect(prompt.input.at(-1)?.role).toBe('developer');
    expect(developer).toContain('### TONE');
    expect(developer).toContain('tense');
    expect(developer).toContain('### SEED');
    expect(developer).toContain('### LOCATION');
    expect(developer).toContain('The Splinter Yards');
  });

  it('omits fragments that resolve to empty values', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const context = buildContext({ playerIntent: buildIntent() });

    const prompt = await composer.buildPrompt(ACTION_RESOLVER, context);
    const developer = textOf(prompt.input.at(-1)!);

    expect(developer).not.toContain(RECENT_EVENTS_HEADER);
    expect(developer).not.toContain(ENTITIES_HEADER);
    expect(developer).not.toContain('### WRAP');
  });

  it('composes the active scene policy and scene fragment into scene-aware prompts', async () => {
    const { rendered, runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const scene = {
      id: 'scene:turn-1',
      progress: 0,
      progressTarget: 4,
      startedAtTurn: 1,
      subject: 'Amaya Venn',
      subjectKind: 'npc' as const,
      type: 'dialog' as const,
    };
    const context = buildContext({
      effectiveScene: scene,
      playerIntent: buildIntent(),
    });

    const prompt = await composer.buildPrompt(ACTION_RESOLVER, context);
    const developer = textOf(prompt.input.at(-1)!);

    expect(prompt.instructions).toContain('instructions:action-resolver');
    expect(prompt.instructions).toContain('instructions:scene-dialog');
    expect(rendered.map((entry) => entry.templateId)).toEqual([
      'action-resolver',
      'scene-dialog',
    ]);
    expect(developer).toContain('### SCENE');
    expect(developer).toContain('Amaya Venn');
  });

  it('offers an unwritten entity as a hook rather than as established canon', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const hook = `${SHELL_NAME} buys broken household bells and returns them tuned.`;
    const context = buildContext({
      entityContext: {
        candidates: [],
        focusEntities: [],
        focusTags: [],
        offered: [
          {
            description: hook,
            facts: {},
            gmNotes: [],
            id: 'entity-2',
            kind: 'npc',
            loreFragments: [{ slug: SHELL_SLUG, summary: hook, tags: [], title: SHELL_NAME }],
            name: SHELL_NAME,
            score: 1,
            slug: SHELL_SLUG,
            tags: [],
            unwritten: true,
          },
        ],
        roster: [],
      },
      playerIntent: buildIntent(),
    });

    const prompt = await composer.buildPrompt(ACTION_RESOLVER, context);
    const developer = textOf(prompt.input.at(-1)!);
    const entities = developer.split(ENTITIES_HEADER)[1]?.split('###')[0]?.trim();

    expect(entities).toBe(
      `- hook: ${hook}\n  kind: npc\n  name: ${SHELL_NAME}\n  slug: ${SHELL_SLUG}\n  unwritten: true`
    );
    expect(prompt.instructions).toContain('invent it concretely');
  });

  it('throws for a template with no registered message order', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);

    await expect(
      composer.buildPrompt('chronicle-seed', buildContext())
    ).rejects.toThrow('No message order is registered for chronicle-seed.');
  });
});

describe('chronicle tone and wrap fragments', () => {
  it('includes the chronicle tone in narration prompts when set', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const context = buildContext({ playerIntent: buildIntent() });
    context.chronicleState.chronicle.toneChips = ['gritty', 'wry'];
    context.chronicleState.chronicle.toneNotes = 'slow-burn dread';

    const prompt = await composer.buildPrompt(ACTION_RESOLVER, context);
    const developer = textOf(prompt.input.at(-1)!);

    expect(developer).toContain('### CHRONICLE-TONE');
    expect(developer).toContain('gritty, wry');
    expect(developer).toContain('slow-burn dread');
  });

  it('clamps turnsLeft at zero once the wrap target passes', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const context = buildContext({ playerIntent: buildIntent(), turnSequence: 9 });
    context.chronicleState.chronicle.targetEndTurn = 5;

    const prompt = await composer.buildPrompt('intent-classifier', context);
    const developer = textOf(prompt.input.at(-1)!);

    expect(developer).toContain('turnsLeft: 0');
  });
});

describe('beat fragments', () => {
  it('exposes beat ids to the beat prompts', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const context = buildContext({ playerIntent: buildIntent() });
    context.chronicleState.chronicle.beats = [
      {
        createdAt: 1,
        description: 'Trace the relay sabotage to its source.',
        id: 'trace_the_sabotage',
        status: 'in_progress',
        title: 'Trace the Sabotage',
        updatedAt: 1,
      },
    ];

    const prompt = await composer.buildPrompt(TURN_JUDGE, context);
    const developer = textOf(prompt.input.at(-1)!);

    expect(developer).toContain('### BEATS');
    expect(developer).toContain('id: trace_the_sabotage');
  });

  it('gives intent and beat classifiers the recent turn record', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const context = buildContext({ playerIntent: buildIntent() });
    context.chronicleState.turns = [
      {
        gmResponse: { content: 'The relay hall quiets as Vex takes the dais.' },
        gmSummary: 'Vex begins the relay performance under observation.',
        playerIntent: buildIntent({ intentSummary: 'Begin the relay performance.' }),
        playerMessage: { content: 'i start playing, watching the room for whoever flinches' },
        turnSequence: 0,
      },
    ] as unknown as GraphContext['chronicleState']['turns'];

    const prompts = await Promise.all([
      'intent-classifier',
      TURN_JUDGE,
    ].map((templateId) => composer.buildPrompt(templateId as PromptTemplateId, context)));
    for (const prompt of prompts) {
      const developer = textOf(prompt.input.at(-1)!);
      expect(developer).toContain(RECENT_EVENTS_HEADER);
      expect(developer).toContain('watching the room for whoever flinches');
      expect(developer).toContain('The relay hall quiets as Vex takes the dais.');
      expect(developer).not.toContain('Begin the relay performance.');
    }
  });
});

describe('the turn record', () => {
  it('keeps the last five narrations verbatim and summarizes the ones before them', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const context = buildContext({ playerIntent: buildIntent() });
    context.chronicleState.turns = Array.from({ length: 8 }, (_, index) => ({
      gmResponse: { content: `full narration ${index}` },
      gmSummary: `summary ${index}`,
      playerIntent: buildIntent({ intentSummary: `paraphrase ${index}` }),
      playerMessage: { content: `player words ${index}` },
      turnSequence: index,
    })) as unknown as GraphContext['chronicleState']['turns'];

    const prompt = await composer.buildPrompt(TURN_JUDGE, context);
    const developer = textOf(prompt.input.at(-1)!);

    for (let index = 0; index < 8; index += 1) {
      expect(developer, `turn ${index} player words`).toContain(`player words ${index}`);
      expect(developer, `turn ${index} paraphrase`).not.toContain(`paraphrase ${index}`);
    }
    for (const index of [3, 4, 5, 6, 7]) {
      expect(developer, `turn ${index} verbatim`).toContain(`full narration ${index}`);
    }
    for (const index of [0, 1, 2]) {
      expect(developer, `turn ${index} summarized`).toContain(`summary ${index}`);
      expect(developer, `turn ${index} not verbatim`).not.toContain(`full narration ${index}`);
    }
  });
});

describe('an oversized player message', () => {
  it('carries the paraphrase instead of the message', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const context = buildContext({ playerIntent: buildIntent() });
    const pasted = 'a'.repeat(1_600);

    context.chronicleState.turns = [{
      gmResponse: { content: CHECKPOINT_NARRATION },
      playerIntent: buildIntent({ intentSummary: 'Vex reads the whole manifest aloud.' }),
      playerMessage: { content: pasted },
      turnSequence: 0,
    }] as unknown as GraphContext['chronicleState']['turns'];

    const prompt = await composer.buildPrompt(TURN_JUDGE, context);
    const developer = textOf(prompt.input.at(-1)!);

    expect(developer).toContain('[long message, summarized] Vex reads the whole manifest aloud.');
    expect(developer).not.toContain('a'.repeat(1_500));
  });

  it('caps the message when the turn never reached the classifier', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const context = buildContext({ playerIntent: buildIntent() });
    context.chronicleState.turns = [{
      gmResponse: { content: CHECKPOINT_NARRATION },
      playerMessage: { content: 'a'.repeat(1_600) },
      turnSequence: 0,
    }] as unknown as GraphContext['chronicleState']['turns'];

    const prompt = await composer.buildPrompt(TURN_JUDGE, context);

    expect(textOf(prompt.input.at(-1)!)).toContain('…message continues');
  });

  it('leaves an ordinary message whole', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const context = buildContext({ playerIntent: buildIntent() });
    const spoken = 'i tell the broker i am done with him and walk toward the cargo bay';
    context.chronicleState.turns = [{
      gmResponse: { content: CHECKPOINT_NARRATION },
      playerMessage: { content: spoken },
      turnSequence: 0,
    }] as unknown as GraphContext['chronicleState']['turns'];

    const prompt = await composer.buildPrompt(TURN_JUDGE, context);

    expect(textOf(prompt.input.at(-1)!)).toContain(spoken);
  });
});

describe('check-planner fragments', () => {
  it('includes scene context alongside intent and character', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const turns = [
      {
        gmResponse: { content: CHECKPOINT_NARRATION },
        gmSummary: CHECKPOINT_NARRATION,
        playerIntent: buildIntent({ intentSummary: 'Slip past the checkpoint.' }),
        playerMessage: { content: 'wait for the guard to turn, then walk through' },
        turnSequence: 0,
      },
    ] as unknown as GraphContext['chronicleState']['turns'];
    const context = buildContext({ playerIntent: buildIntent() });
    context.chronicleState.turns = turns;

    const prompt = await composer.buildPrompt('check-planner', context);
    const developer = textOf(prompt.input.at(-1)!);

    expect(developer).toContain(RECENT_EVENTS_HEADER);
    expect(developer).toContain(CHECKPOINT_NARRATION);
    expect(developer).toContain('### LOCATION');
    expect(developer).toContain('### CHARACTER');
  });

  it('exposes the full planned and resolved check contract to narration', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const context = buildContext({
      playerIntent: buildIntent(),
      skillCheckPlan: {
        advantage: 'disadvantage',
        attribute: 'presence',
        complicationSeeds: ['The audience turns openly hostile.'],
        creativeSpark: false,
        metadata: { tags: [], timestamp: 0 },
        requiresCheck: true,
        riskLevel: 'risky',
        skill: 'performance',
      },
      skillCheckResult: {
        advantage: false,
        checkId: 'check-1',
        chronicleId: 'chronicle-1',
        dieSum: 3,
        disadvantage: true,
        margin: -4,
        metadata: { tags: [], timestamp: 0 },
        newMomentum: -1,
        outcomeTier: 'collapse',
        totalModifier: 0,
      },
    });

    const prompt = await composer.buildPrompt(ACTION_RESOLVER, context);
    const developer = textOf(prompt.input.at(-1)!);

    expect(developer).toContain('requiresCheck: true');
    expect(developer).toContain('swing: disadvantage');
    expect(developer).toContain('outcome: collapse');
    expect(developer).toContain('The audience turns openly hostile.');
    expect(developer).not.toContain('plannedAdvantage');
  });
});
