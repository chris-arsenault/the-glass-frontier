import type { PromptTemplateRuntime } from '@glass-frontier/app';
import type { PromptTemplateId } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { PromptComposer } from '../src/prompts/prompts';
import type { GraphContext } from '../src/types';
import { buildContext, buildIntent } from './harness';

const recordingRuntime = (): PromptTemplateRuntime => ({
  render: (templateId: PromptTemplateId) => Promise.resolve(`instructions:${templateId}`),
}) as unknown as PromptTemplateRuntime;

const textOf = (message: { content: Array<{ text: string }> }): string =>
  message.content.map((part) => part.text).join('');

const INTERNAL_THREAD_ID = 'internal-player-thread-id';

describe('PromptComposer', () => {
  it('gives narration the focused goal without exposing its internal id', async () => {
    const context = buildContext({
      effectiveFocusedThreadId: INTERNAL_THREAD_ID,
      effectiveThreads: [{
        goal: 'Reach the silent relay.',
        id: INTERNAL_THREAD_ID,
        owner: 'Vex',
        perspective: 'player',
        position: 'The sealed gallery still blocks the route.',
        title: 'Reach the relay',
        updatedAtTurn: 0,
      }],
      playerIntent: buildIntent(),
    });

    const prompt = await new PromptComposer(recordingRuntime())
      .buildPrompt('action-resolver', context);
    const developer = textOf(prompt.input.at(-1)!);

    expect(prompt.input[0]?.role).toBe('user');
    expect(developer).toContain('### THREADS');
    expect(developer).toContain('Reach the relay');
    expect(developer).not.toContain(INTERNAL_THREAD_ID);
    expect(developer).not.toContain('### TONE');
  });

  it('supplies the bounded question and final-turn instruction', async () => {
    const context = buildContext({
      effectiveScene: {
        id: 'scene-1',
        question: 'Can Vex cross the sealed gallery?',
        threadId: null,
        turnsRemaining: 0,
        type: 'search',
      },
      playerIntent: buildIntent(),
      sceneBoundary: true,
      sceneWillClose: true,
    });

    const prompt = await new PromptComposer(recordingRuntime())
      .buildPrompt('action-resolver', context);
    const developer = textOf(prompt.input.at(-1)!);

    expect(prompt.instructions).toContain('instructions:scene-search');
    expect(developer).toContain('question: Can Vex cross the sealed gallery?');
    expect(developer).toContain('mustAnswerThisTurn: true');
  });

  it('keeps the recent turn record verbatim for the recent window', async () => {
    const context = buildContext({ playerIntent: buildIntent() });
    context.chronicleState.turns = [{
      gmResponse: { content: 'The gallery door refuses the first key.' },
      gmSummary: 'The first key failed.',
      playerIntent: buildIntent({ intentSummary: 'Try the first key.' }),
      playerMessage: { content: 'I test the brass key in the gallery door.' },
      turnSequence: 0,
    }] as unknown as GraphContext['chronicleState']['turns'];

    const prompt = await new PromptComposer(recordingRuntime())
      .buildPrompt('intent-classifier', context);
    const developer = textOf(prompt.input.at(-1)!);

    expect(developer).toContain('I test the brass key in the gallery door.');
    expect(developer).toContain('The gallery door refuses the first key.');
  });
});
