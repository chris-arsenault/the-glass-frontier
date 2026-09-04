import type { HardState, NarrativeThread } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { EnvironmentNode } from '../src/gmGraph/nodes/EnvironmentNode';
import type { GraphContext } from '../src/types';
import { buildContext, buildIntent } from './harness';

const YARD = {
  contextTags: [],
  description: 'A salvage yard stacked with dead relay masts.',
  descriptiveIdentity: { activity: 'Crews strip masts through the cold hours.' },
  dm: false,
  facts: {},
  gmNotes: [{ kind: 'complicates', text: 'The south hoist has been red-tagged for a week.' }],
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  kind: 'installation',
  links: [],
  name: 'The Splinter Yards',
  prominence: 'recognized',
  slug: 'splinter-yards',
  veiled: false,
} as unknown as HardState;

const WORLD_THREAD: NarrativeThread = {
  goal: 'Reopen the south hoist before inspection.',
  id: 'world-thread',
  owner: 'The night crew',
  perspective: 'world',
  position: 'The hoist remains red-tagged.',
  title: 'The south hoist',
  updatedAtTurn: 0,
};

const environmentContext = (
  captured: { instructions?: string; text?: string },
  prose: string
): GraphContext => {
  const context = buildContext({
    effectiveThreads: [WORLD_THREAD],
    gmResponse: {
      content: 'The access panel opens.',
      id: 'gm-1',
      metadata: { tags: [], timestamp: 0 },
      role: 'gm',
    },
    playerIntent: buildIntent(),
    sceneBoundary: true,
  });
  context.llm = {
    generate: (request: {
      input: Array<{ content: Array<{ text: string }> }>;
      instructions: string;
    }) => {
      captured.instructions = request.instructions;
      captured.text = request.input[0]?.content[0]?.text;
      return Promise.resolve({
        message: prose,
        requestId: 'environment-request',
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
      });
    },
  } as unknown as GraphContext['llm'];
  context.modelConfigStore = {
    getModelForCategory: () => Promise.resolve('amazon-nova-pro'),
  } as unknown as GraphContext['modelConfigStore'];
  context.worldSchemaStore = {
    findEntitiesByName: () => Promise.resolve([]),
    findLocationByName: () => Promise.resolve(YARD),
  } as unknown as GraphContext['worldSchemaStore'];
  return context;
};

describe('environment node', () => {
  it('advances one world thread with player-free prose at a scene boundary', async () => {
    const captured: { instructions?: string; text?: string } = {};
    const delta = await new EnvironmentNode().execute(environmentContext(
      captured,
      'Yard crews reroute power toward the relay mast.'
    ));

    expect(delta.worldContent).toContain('reroute power');
    expect(delta.worldThreadUpdate).toEqual({
      position: 'Yard crews reroute power toward the relay mast.',
      threadId: 'world-thread',
    });
    expect(captured.text).toContain('### WORLD THREAD');
    expect(captured.text).toContain('The south hoist');
    expect(captured.text).not.toContain('pry the access panel');
    expect(captured.instructions).toContain('Return prose only');
  });

  it('treats an empty response as a nonfatal tracking failure', async () => {
    const delta = await new EnvironmentNode().execute(environmentContext({}, '   '));

    expect(delta).toEqual({});
  });
});
