import { describe, expect, it } from 'vitest';

import { mergeSceneLedger } from '../src/scenes/sceneLedger';

const KEEPER = 'The Keeper';
const PLACE = { detail: 'Bunk rows and a shared stove.', kind: 'hostel', name: 'Fourth Bell House' };

describe('mergeSceneLedger', () => {
  it('starts a ledger from the first report', () => {
    const merged = mergeSceneLedger(
      null,
      {
        interactions: ['Tsonu asked the keeper about beds.'],
        place: PLACE,
        present: [{ detail: 'Behind the counter, wary.', name: KEEPER }],
      },
      3
    );

    expect(merged.place?.kind).toBe('hostel');
    expect(merged.present).toHaveLength(1);
    expect(merged.interactions).toEqual(['Tsonu asked the keeper about beds.']);
    expect(merged.updatedAtTurn).toBe(3);
  });

  it('accumulates interactions with a cap and replaces place and present', () => {
    const current = {
      interactions: Array.from({ length: 8 }, (_, index) => `event ${index}`),
      place: PLACE,
      present: [{ detail: 'Wary.', name: KEEPER }],
      updatedAtTurn: 4,
    };
    const merged = mergeSceneLedger(
      current,
      {
        interactions: ['Dave arrived with balloons.'],
        place: { ...PLACE, detail: 'Bunk rows, a stove, and now a crowd.' },
        present: [
          { detail: 'Making balloon animals.', name: 'Dave' },
          { detail: 'Distracted.', name: KEEPER },
        ],
      },
      5
    );

    expect(merged.interactions).toHaveLength(8);
    expect(merged.interactions.at(-1)).toBe('Dave arrived with balloons.');
    expect(merged.interactions[0]).toBe('event 1');
    expect(merged.place?.detail).toContain('now a crowd');
    expect(merged.present.map((entry) => entry.name)).toEqual(['Dave', KEEPER]);
  });

  it('keeps the stored roster when a report omits presences', () => {
    const current = {
      interactions: [],
      place: PLACE,
      present: [{ detail: 'Wary.', name: KEEPER }],
      updatedAtTurn: 4,
    };
    const merged = mergeSceneLedger(
      current,
      { interactions: [], place: null, present: [] },
      5
    );

    expect(merged.present).toEqual(current.present);
    expect(merged.place).toEqual(PLACE);
  });
});
