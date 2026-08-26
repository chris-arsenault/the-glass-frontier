import type { Front, WorldTurn } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import { applyWorldTurn, visibleFronts } from '../src/world/fronts';

const AUDIT_FRONT = 'front-audit';

const front = (overrides?: Partial<Front>): Front => ({
  agentSlug: 'pell_freight_assembly',
  filled: 0,
  id: AUDIT_FRONT,
  intent: 'Trace the missing manifests to a crew',
  nextSign: 'A clerk asks about last night\'s dock roster',
  size: 4,
  startedAtTurn: 0,
  status: 'active',
  updatedAtTurn: 0,
  ...overrides,
});

const report = (overrides?: Partial<WorldTurn>): WorldTurn => ({
  firedFrontId: null,
  proposal: null,
  ticks: [],
  world: 'The yard is quiet and the factors are still reading.',
  ...overrides,
});

describe('front bookkeeping', () => {
  it('advances a clock by the segments the world reported', () => {
    const [updated] = applyWorldTurn(
      [front()],
      report({ ticks: [{ frontId: AUDIT_FRONT, segments: 2, why: 'the roster surfaced' }] }),
      3
    );

    expect(updated?.filled).toBe(2);
    expect(updated?.updatedAtTurn).toBe(3);
    expect(updated?.status).toBe('active');
  });

  it('fires a front whose clock has filled', () => {
    const [updated] = applyWorldTurn(
      [front({ filled: 3 })],
      report({
        firedFrontId: AUDIT_FRONT,
        ticks: [{ frontId: AUDIT_FRONT, segments: 1, why: 'the clerk reached the yard' }],
      }),
      5
    );

    expect(updated?.status).toBe('fired');
  });

  it('ignores a nomination whose clock is not full, because the clock is the promise', () => {
    const [updated] = applyWorldTurn([front({ filled: 1 })], report({
      firedFrontId: AUDIT_FRONT,
    }), 5);

    expect(updated?.status).toBe('active');
  });

  it('fires only the oldest of several full clocks, and spends a fired front next turn', () => {
    const fronts = [
      front({ filled: 4, id: 'front-old', startedAtTurn: 1 }),
      front({ agentSlug: 'clarisant', filled: 4, id: 'front-new', startedAtTurn: 4 }),
    ];

    const afterFiring = applyWorldTurn(fronts, report(), 6);
    expect(afterFiring.find((entry) => entry.id === 'front-old')?.status).toBe('fired');
    expect(afterFiring.find((entry) => entry.id === 'front-new')?.status).toBe('active');

    const afterLanding = applyWorldTurn(afterFiring, report(), 7);
    expect(afterLanding.find((entry) => entry.id === 'front-old')?.status).toBe('spent');
    expect(afterLanding.find((entry) => entry.id === 'front-new')?.status).toBe('fired');
  });

  it('takes a proposal only while there is room and the agent is not already busy', () => {
    const proposal = {
      agentSlug: 'clarisant',
      intent: 'Certify the tuners working the yard',
      nextSign: 'A certifier books passage',
      size: 4,
    };

    const opened = applyWorldTurn([front()], report({ proposal }), 2);
    expect(opened).toHaveLength(2);

    const duplicate = applyWorldTurn(opened, report({ proposal }), 3);
    expect(duplicate).toHaveLength(2);

    const full = applyWorldTurn(
      [front({ id: 'a' }), front({ agentSlug: 'b', id: 'b' }), front({ agentSlug: 'c', id: 'c' })],
      report({ proposal }),
      4
    );
    expect(full).toHaveLength(3);
  });

  it('shows the environment only what is live or just landed', () => {
    const fronts = [
      front({ id: 'live' }),
      front({ id: 'fired', status: 'fired' }),
      front({ id: 'spent', status: 'spent' }),
      front({ id: 'gone', status: 'abandoned' }),
    ];

    expect(visibleFronts(fronts).map((entry) => entry.id)).toEqual(['live', 'fired']);
  });
});
