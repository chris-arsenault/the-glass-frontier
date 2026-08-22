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

const textOf = (message: { content: Array<{ text: string }> }): string =>
  message.content.map((part) => part.text).join('');

describe('PromptComposer', () => {
  it('renders instructions with the character name available to templates', async () => {
    const { rendered, runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const context = buildContext({ playerIntent: buildIntent() });

    const prompt = await composer.buildPrompt(ACTION_RESOLVER, context);

    expect(prompt.instructions).toBe('instructions:action-resolver');
    expect(rendered[0]?.data).toEqual({ character: { name: 'Vex' } });
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
    expect(developer).not.toContain('### ENTITIES');
    expect(developer).not.toContain('### WRAP');
  });

  it('gives the entity judge the GM response as the user message and entities as a fragment', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const context = buildContext({
      entityContext: {
        focusEntities: [],
        focusTags: [],
        offered: [
          {
            description: 'A smuggling ring that controls the ash docks.',
            facts: { founded: 2402 },
            id: 'entity-1',
            kind: 'faction',
            loreFragments: [],
            name: 'Ash Cartel',
            score: 1,
            slug: 'ash-cartel',
            tags: ['trade'],
          },
        ],
      },
      gmResponse: {
        content: 'The cartel enforcer blocks the doorway.',
        id: 'gm-1',
        metadata: { tags: [], timestamp: 0 },
        role: 'gm',
      },
      playerIntent: buildIntent(),
    });

    const prompt = await composer.buildPrompt('entity-judge', context);

    expect(prompt.input[0]?.role).toBe('user');
    expect(textOf(prompt.input[0])).toBe('The cartel enforcer blocks the doorway.');
    const developer = textOf(prompt.input.at(-1)!);
    expect(developer).toContain('### ENTITIES');
    expect(developer).toContain('ash-cartel');
    expect(developer).toContain('A smuggling ring that controls the ash docks.');
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

    expect(developer).toContain('"turnsLeft":0');
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

    const prompt = await composer.buildPrompt('beat-tracker', context);
    const developer = textOf(prompt.input.at(-1)!);

    expect(developer).toContain('### BEATS');
    expect(developer).toContain('"id":"trace_the_sabotage"');
  });

  it('gives intent and beat classifiers the recent turn record', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const context = buildContext({ playerIntent: buildIntent() });
    context.chronicleState.turns = [
      {
        gmSummary: 'Vex begins the relay performance under observation.',
        playerIntent: buildIntent({ intentSummary: 'Begin the relay performance.' }),
      },
    ] as unknown as GraphContext['chronicleState']['turns'];

    const prompts = await Promise.all([
      'intent-classifier',
      'intent-beat-detector',
      'beat-tracker',
    ].map((templateId) => composer.buildPrompt(templateId as PromptTemplateId, context)));
    for (const prompt of prompts) {
      const developer = textOf(prompt.input.at(-1)!);
      expect(developer).toContain(RECENT_EVENTS_HEADER);
      expect(developer).toContain('Vex begins the relay performance under observation.');
    }
  });
});

describe('check-planner fragments', () => {
  it('includes scene context alongside intent and character', async () => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const turns = [
      {
        gmSummary: 'Vex slipped past the checkpoint.',
        playerIntent: buildIntent({ intentSummary: 'Slip past the checkpoint.' }),
      },
    ] as unknown as GraphContext['chronicleState']['turns'];
    const context = buildContext({ playerIntent: buildIntent() });
    context.chronicleState.turns = turns;

    const prompt = await composer.buildPrompt('check-planner', context);
    const developer = textOf(prompt.input.at(-1)!);

    expect(developer).toContain(RECENT_EVENTS_HEADER);
    expect(developer).toContain('Vex slipped past the checkpoint.');
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

    expect(developer).toContain('"requiresCheck":true');
    expect(developer).toContain('"plannedAdvantage":"disadvantage"');
    expect(developer).toContain('"resultDisadvantage":true');
    expect(developer).toContain('The audience turns openly hostile.');
  });
});
