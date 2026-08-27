import type { Front, HardState, WorldTurn } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { EnvironmentNode } from '../src/gmGraph/nodes/EnvironmentNode';
import type { GraphContext } from '../src/types';
import { buildContext, buildIntent } from './harness';

const YARD_SLUG = 'splinter-yards';

const YARD: HardState = {
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
  slug: YARD_SLUG,
  veiled: false,
} as unknown as HardState;

const worldReport = (overrides?: Partial<WorldTurn>): WorldTurn => ({
  abandonedFrontIds: [],
  firedFrontId: null,
  proposal: null,
  ticks: [],
  world: 'Yard crews reroute power toward the relay mast.',
  ...overrides,
});

const environmentContext = (options: {
  agentEntity: HardState | null;
  fronts?: Front[];
  report: WorldTurn;
  captured: { instructions?: string; text?: string };
}): GraphContext => {
  const context = buildContext({ playerIntent: buildIntent() });
  context.chronicleState.chronicle.fronts = options.fronts ?? [];
  context.llm = {
    generateStructured: (request: {
      input: Array<{ content: Array<{ text: string }> }>;
      instructions: string;
    }) => {
      options.captured.instructions = request.instructions;
      options.captured.text = request.input[0]?.content[0]?.text;
      return Promise.resolve({ data: options.report });
    },
  } as unknown as GraphContext['llm'];
  context.modelConfigStore = {
    getModelForCategory: (category: string) => {
      expect(category).toBe('prose');
      return Promise.resolve('amazon-nova-pro');
    },
  } as unknown as GraphContext['modelConfigStore'];
  context.worldSchemaStore = {
    findLocationByName: () => Promise.resolve(YARD),
    getEntityBySlug: () => Promise.resolve(options.agentEntity),
  } as unknown as GraphContext['worldSchemaStore'];
  return context;
};

describe('environment node', () => {
  it('feeds the world a player-free view and records its move', async () => {
    const captured: { instructions?: string; text?: string } = {};
    const context = environmentContext({ agentEntity: null, captured, report: worldReport() });

    const delta = await new EnvironmentNode().execute(context);

    expect(delta.worldContent).toContain('reroute power');
    expect(captured.text).toContain('### WORLD-CANON');
    expect(captured.text).toContain('red-tagged');
    // The player's message, intent, and sheet never reach the world.
    expect(captured.text).not.toContain('pry the access panel');
    expect(captured.text).not.toContain('Vex');
    expect(captured.text).not.toContain('INTENT');
    expect(captured.instructions).toContain('Nothing is running yet');
  });

  it('drops a proposed front whose agent is not canon and keeps a canon one', async () => {
    const proposal = {
      agentSlug: YARD_SLUG,
      intent: 'Reopen the south hoist before inspection',
      nextSign: 'A crew chief argues with the red tag',
      size: 4,
    };
    const dropped: { instructions?: string; text?: string } = {};
    const droppedDelta = await new EnvironmentNode().execute(environmentContext({
      agentEntity: null,
      captured: dropped,
      report: worldReport({ proposal }),
    }));
    expect(droppedDelta.worldFronts).toStrictEqual([]);

    const kept: { instructions?: string; text?: string } = {};
    const keptDelta = await new EnvironmentNode().execute(environmentContext({
      agentEntity: YARD,
      captured: kept,
      report: worldReport({ proposal }),
    }));
    expect(keptDelta.worldFronts?.map((front) => front.agentSlug))
      .toStrictEqual([YARD_SLUG]);
  });
});
