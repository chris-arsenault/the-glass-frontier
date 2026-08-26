import type { Front, WorldTurn } from '@glass-frontier/dto';
import { MAX_LIVE_FRONTS } from '@glass-frontier/dto';
import { toSnakeCase } from '@glass-frontier/utils';

/**
 * Applies the environment stage's report to the world's agendas.
 *
 * The model says what moved and why; the arithmetic, the cap, and the firing
 * rule live here. A clock that fills fires, and only one front may fire on a
 * turn — the rest keep their fill and wait, so the world arrives in single
 * events rather than all at once.
 */
export const applyWorldTurn = (
  fronts: Front[],
  report: WorldTurn,
  turnSequence: number
): Front[] => {
  const pruned = fronts.map((front) => abandon(front, report, turnSequence));
  const ticked = pruned.map((front) => tick(front, report, turnSequence));
  const withFiring = resolveFiring(ticked, report.firedFrontId, turnSequence);
  return withProposal(withFiring, report, turnSequence);
};

/** A premise that no longer holds frees its slot; its clock is not spent. */
const abandon = (front: Front, report: WorldTurn, turnSequence: number): Front => {
  if (front.status !== 'active' || !report.abandonedFrontIds.includes(front.id)) {
    return front;
  }
  return { ...front, status: 'abandoned' as const, updatedAtTurn: turnSequence };
};

const tick = (front: Front, report: WorldTurn, turnSequence: number): Front => {
  if (front.status !== 'active') {
    return front;
  }
  const segments = report.ticks.find((entry) => entry.frontId === front.id)?.segments ?? 0;
  if (segments === 0) {
    return front;
  }
  return {
    ...front,
    filled: Math.min(front.size, front.filled + segments),
    updatedAtTurn: turnSequence,
  };
};

/**
 * A front fires when its clock is full. The model nominates one; a nomination
 * whose clock has not filled is ignored, because the clock is the promise the
 * player is owed. When several are full, the oldest goes first.
 */
const resolveFiring = (
  fronts: Front[],
  nominated: string | null,
  turnSequence: number
): Front[] => {
  const full = fronts.filter((front) => front.status === 'active' && front.filled >= front.size);
  if (full.length === 0) {
    return fronts.map((front) => front.status === 'fired'
      ? { ...front, status: 'spent' as const, updatedAtTurn: turnSequence }
      : front);
  }
  const firing = full.find((front) => front.id === nominated)
    ?? [...full].sort((left, right) => left.startedAtTurn - right.startedAtTurn)[0];
  return fronts.map((front) => {
    if (front.id === firing?.id) {
      return { ...front, status: 'fired' as const, updatedAtTurn: turnSequence };
    }
    return front.status === 'fired'
      ? { ...front, status: 'spent' as const, updatedAtTurn: turnSequence }
      : front;
  });
};

const withProposal = (
  fronts: Front[],
  report: WorldTurn,
  turnSequence: number
): Front[] => {
  const proposal = report.proposal;
  const live = fronts.filter((front) => front.status === 'active');
  if (proposal === null || live.length >= MAX_LIVE_FRONTS) {
    return fronts;
  }
  const id = `front:${toSnakeCase(proposal.intent).slice(0, 40)}:${turnSequence}`;
  if (fronts.some((front) => front.agentSlug === proposal.agentSlug && front.status === 'active')) {
    return fronts;
  }
  return [...fronts, {
    agentSlug: proposal.agentSlug,
    filled: 0,
    id,
    intent: proposal.intent,
    nextSign: proposal.nextSign,
    size: proposal.size,
    startedAtTurn: turnSequence,
    status: 'active' as const,
    updatedAtTurn: turnSequence,
  }];
};

/** What the environment stage and the scout are shown: live and just-fired. */
export const visibleFronts = (fronts: Front[]): Front[] =>
  fronts.filter((front) => front.status === 'active' || front.status === 'fired');
