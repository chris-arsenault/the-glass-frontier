import type { Character, SkillCheckPlan } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { CheckRunnerNode } from '../src/gmGraph/nodes/CheckRunnerNode';
import { buildContext } from './harness';

const character: Character = {
  archetype: 'Musician',
  attributes: {
    attunement: 'standard',
    finesse: 'standard',
    focus: 'standard',
    ingenuity: 'standard',
    presence: 'standard',
    resolve: 'standard',
    vitality: 'standard',
  },
  bio: 'A dockside player who keeps the wrong company.',
  id: 'character-1',
  inventory: [],
  momentum: { ceiling: 3, current: 0, floor: -2 },
  name: 'Vex',
  nature: {
    callings: ['Find the tuner who taught them', 'Pay off the Wardens'],
    drive: 'Be heard by someone who matters',
    flaw: 'Plays for the room instead of the job',
    instinct: 'When a crowd turns, they start playing',
    uniqueThing: 'The last person to hear the drowned choir and walk away',
  },
  origin: {
    allegianceId: '11111111-1111-4111-8111-111111111111',
    allegianceStance: 'indebted',
    cultureId: '22222222-2222-4222-8222-222222222222',
    homelandId: '33333333-3333-4333-8333-333333333333',
    speciesId: '44444444-4444-4444-8444-444444444444',
  },
  playerId: 'player-1',
  pronouns: 'they/them',
  skills: {
    hold_a_hostile_room: {
      attribute: 'presence',
      name: 'hold a hostile room',
      tier: 'artisan',
      xp: 0,
    },
  },
  tags: [],
};

const plan = (
  advantage: SkillCheckPlan['advantage'],
  skill = 'hold a hostile room'
): SkillCheckPlan => ({
  advantage,
  attribute: 'presence',
  complicationSeeds: ['The audience turns openly hostile.'],
  creativeSpark: false,
  metadata: { tags: [], timestamp: 0 },
  requiresCheck: true,
  riskLevel: 'risky',
  skill,
});

describe('CheckRunnerNode', () => {
  it('applies the disadvantage selected by the check planner', () => {
    const context = buildContext({ skillCheckPlan: plan('disadvantage') });
    context.chronicleState.character = character;

    const delta = new CheckRunnerNode().execute(context);

    expect(delta.skillCheckResult?.advantage).toBe(false);
    expect(delta.skillCheckResult?.disadvantage).toBe(true);
  });

  it('credits a declared skill whose name the planner re-cased', () => {
    const context = buildContext({ skillCheckPlan: plan('none', 'Hold A Hostile Room') });
    context.chronicleState.character = character;

    const delta = new CheckRunnerNode().execute(context);

    // artisan (+1) + presence standard (0) + momentum 0. An unmatched skill
    // would fall back to `fool` and score -2.
    expect(delta.skillCheckResult?.totalModifier).toBe(1);
  });
});
