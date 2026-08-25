import { describe, expect, it } from 'vitest';

import type { Seat } from './match';
import {
  compareScores,
  foldEntries,
  lastRound,
  makeEntry,
  rawTotal,
  roundsWithValues,
  scoreSeat,
  standings,
  supersedes,
  valueAt,
  winners,
  type ScoreEntry,
} from './scoring';
import type { ScoreCategory, ScoreTemplate } from './template';

function seat(id: string, order: number, name = id): Seat {
  return { id, matchId: 'm1', playerId: `p-${id}`, playerName: name, order };
}

function entry(partial: Partial<ScoreEntry> & Pick<ScoreEntry, 'seatId' | 'categoryKey' | 'value'>): ScoreEntry {
  return {
    id: partial.id ?? `e-${partial.seatId}-${partial.categoryKey}-${partial.value}`,
    matchId: partial.matchId ?? 'm1',
    round: partial.round ?? 0,
    recordedAt: partial.recordedAt ?? 1_000,
    deviceId: partial.deviceId ?? 'device-a',
    seatId: partial.seatId,
    categoryKey: partial.categoryKey,
    value: partial.value,
  };
}

const simple: ScoreTemplate = {
  id: 'simple',
  name: 'Simple',
  categories: [{ key: 'points', label: 'Points', input: 'number' }],
};

describe('foldEntries', () => {
  it('keeps the most recent entry per slot', () => {
    const state = foldEntries([
      entry({ id: 'a', seatId: 's1', categoryKey: 'points', value: 5, recordedAt: 100 }),
      entry({ id: 'b', seatId: 's1', categoryKey: 'points', value: 9, recordedAt: 200 }),
    ]);

    expect(valueAt(state, 's1', 'points', 0)).toBe(9);
  });

  it('ignores a stale entry that arrives late', () => {
    const state = foldEntries([
      entry({ id: 'b', seatId: 's1', categoryKey: 'points', value: 9, recordedAt: 200 }),
      entry({ id: 'a', seatId: 's1', categoryKey: 'points', value: 5, recordedAt: 100 }),
    ]);

    expect(valueAt(state, 's1', 'points', 0)).toBe(9);
  });

  it('converges regardless of arrival order', () => {
    const entries = [
      entry({ id: 'a', seatId: 's1', categoryKey: 'points', value: 5, recordedAt: 100 }),
      entry({ id: 'b', seatId: 's1', categoryKey: 'points', value: 9, recordedAt: 200 }),
      entry({ id: 'c', seatId: 's2', categoryKey: 'points', value: 3, recordedAt: 150 }),
    ];
    const forwards = foldEntries(entries);
    const backwards = foldEntries([...entries].reverse());

    expect(valueAt(forwards, 's1', 'points', 0)).toBe(valueAt(backwards, 's1', 'points', 0));
    expect(valueAt(forwards, 's2', 'points', 0)).toBe(valueAt(backwards, 's2', 'points', 0));
  });

  it('breaks a same-millisecond tie by entry id, not arrival order', () => {
    const older = entry({ id: 'AAA', seatId: 's1', categoryKey: 'points', value: 1, recordedAt: 500 });
    const newer = entry({ id: 'ZZZ', seatId: 's1', categoryKey: 'points', value: 2, recordedAt: 500 });

    expect(valueAt(foldEntries([older, newer]), 's1', 'points', 0)).toBe(2);
    expect(valueAt(foldEntries([newer, older]), 's1', 'points', 0)).toBe(2);
  });

  it('keeps rounds of the same category apart', () => {
    const state = foldEntries([
      entry({ seatId: 's1', categoryKey: 'trick', value: 2, round: 1 }),
      entry({ seatId: 's1', categoryKey: 'trick', value: 7, round: 2 }),
    ]);

    expect(valueAt(state, 's1', 'trick', 1)).toBe(2);
    expect(valueAt(state, 's1', 'trick', 2)).toBe(7);
    expect(roundsWithValues(state, 's1', 'trick')).toEqual([1, 2]);
  });

  it('reports nothing for a slot never written', () => {
    expect(valueAt(foldEntries([]), 's1', 'points', 0)).toBeUndefined();
  });
});

describe('supersedes', () => {
  it('accepts anything into an empty slot', () => {
    expect(supersedes(entry({ seatId: 's1', categoryKey: 'points', value: 1 }), undefined)).toBe(true);
  });
});

describe('rawTotal', () => {
  const plain: ScoreCategory = { key: 'points', label: 'Points', input: 'number' };
  const rating: ScoreCategory = { key: 'rating', label: 'Rating', input: 'number', defaultValue: 20 };
  const trick: ScoreCategory = { key: 'trick', label: 'Trick', input: 'number', perRound: true };

  it('falls back to the declared default while nothing is entered', () => {
    expect(rawTotal(foldEntries([]), 's1', rating)).toBe(20);
  });

  it('lets a real entry replace the default, including zero', () => {
    const state = foldEntries([entry({ seatId: 's1', categoryKey: 'rating', value: 0 })]);
    expect(rawTotal(state, 's1', rating)).toBe(0);
  });

  it('returns zero for a category with no default and no entry', () => {
    expect(rawTotal(foldEntries([]), 's1', plain)).toBe(0);
  });

  it('accumulates a per-round category across rounds', () => {
    const state = foldEntries([
      entry({ seatId: 's1', categoryKey: 'trick', value: 3, round: 1 }),
      entry({ seatId: 's1', categoryKey: 'trick', value: 4, round: 2 }),
      entry({ seatId: 's1', categoryKey: 'trick', value: 5, round: 3 }),
    ]);

    expect(rawTotal(state, 's1', trick)).toBe(12);
  });

  it('keeps per-round accumulation scoped to one seat', () => {
    const state = foldEntries([
      entry({ seatId: 's1', categoryKey: 'trick', value: 3, round: 1 }),
      entry({ seatId: 's2', categoryKey: 'trick', value: 100, round: 1 }),
    ]);

    expect(rawTotal(state, 's1', trick)).toBe(3);
  });
});

describe('scoreSeat', () => {
  const template: ScoreTemplate = {
    id: 'mars',
    name: 'Multiplier test',
    categories: [
      { key: 'rating', label: 'Rating', input: 'number', defaultValue: 20 },
      { key: 'cities', label: 'Cities', input: 'counter', multiplier: 2 },
      { key: 'cash', label: 'Cash', input: 'number', excludeFromTotal: true },
    ],
  };

  it('applies the multiplier and reports units separately from points', () => {
    const state = foldEntries([entry({ seatId: 's1', categoryKey: 'cities', value: 3 })]);
    const score = scoreSeat(template, state, 's1');

    expect(score.units.get('cities')).toBe(3);
    expect(score.points.get('cities')).toBe(6);
  });

  it('adds the default-backed category into the total', () => {
    const score = scoreSeat(template, foldEntries([]), 's1');
    expect(score.total).toBe(20);
  });

  it('leaves an excluded category out of the total but still reports it', () => {
    const state = foldEntries([entry({ seatId: 's1', categoryKey: 'cash', value: 50 })]);
    const score = scoreSeat(template, state, 's1');

    expect(score.points.get('cash')).toBe(50);
    expect(score.total).toBe(20);
  });
});

describe('standings', () => {
  const seats = [seat('s1', 0, 'Ana'), seat('s2', 1, 'Bea'), seat('s3', 2, 'Caro')];

  it('ranks the highest total first', () => {
    const state = foldEntries([
      entry({ seatId: 's1', categoryKey: 'points', value: 10 }),
      entry({ seatId: 's2', categoryKey: 'points', value: 30 }),
      entry({ seatId: 's3', categoryKey: 'points', value: 20 }),
    ]);
    const rows = standings(simple, state, seats);

    expect(rows.map((row) => row.seat.playerName)).toEqual(['Bea', 'Caro', 'Ana']);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it('ranks the lowest total first when the template says so', () => {
    const golf: ScoreTemplate = { ...simple, id: 'golf', lowestWins: true };
    const state = foldEntries([
      entry({ seatId: 's1', categoryKey: 'points', value: 10 }),
      entry({ seatId: 's2', categoryKey: 'points', value: 30 }),
      entry({ seatId: 's3', categoryKey: 'points', value: 20 }),
    ]);

    expect(standings(golf, state, seats).map((row) => row.seat.playerName)).toEqual([
      'Ana',
      'Caro',
      'Bea',
    ]);
  });

  it('shares a rank between genuinely tied seats and skips the next one', () => {
    const state = foldEntries([
      entry({ seatId: 's1', categoryKey: 'points', value: 30 }),
      entry({ seatId: 's2', categoryKey: 'points', value: 30 }),
      entry({ seatId: 's3', categoryKey: 'points', value: 10 }),
    ]);
    const rows = standings(simple, state, seats);

    expect(rows.map((row) => row.rank)).toEqual([1, 1, 3]);
    expect(winners(rows).map((row) => row.seat.playerName)).toEqual(['Ana', 'Bea']);
  });

  it('breaks a tie with the declared tiebreaker before sharing a rank', () => {
    const withTiebreak: ScoreTemplate = {
      id: 'tb',
      name: 'Tiebreak',
      categories: [
        { key: 'points', label: 'Points', input: 'number' },
        { key: 'cash', label: 'Cash', input: 'number', excludeFromTotal: true },
      ],
      tiebreakers: ['cash'],
    };
    const state = foldEntries([
      entry({ seatId: 's1', categoryKey: 'points', value: 30 }),
      entry({ seatId: 's1', categoryKey: 'cash', value: 1 }),
      entry({ seatId: 's2', categoryKey: 'points', value: 30 }),
      entry({ seatId: 's2', categoryKey: 'cash', value: 9 }),
    ]);
    const rows = standings(withTiebreak, state, [seats[0]!, seats[1]!]);

    expect(rows.map((row) => row.seat.playerName)).toEqual(['Bea', 'Ana']);
    expect(rows.map((row) => row.rank)).toEqual([1, 2]);
  });

  it('orders an all-zero match by seat without inventing a winner', () => {
    const rows = standings(simple, foldEntries([]), seats);

    expect(rows.map((row) => row.seat.playerName)).toEqual(['Ana', 'Bea', 'Caro']);
    expect(rows.map((row) => row.rank)).toEqual([1, 1, 1]);
    expect(winners(rows)).toHaveLength(3);
  });

  it('handles a match with no seats', () => {
    expect(standings(simple, foldEntries([]), [])).toEqual([]);
  });

  it('produces the same table however the entries arrived', () => {
    const entries = [
      entry({ id: 'a', seatId: 's1', categoryKey: 'points', value: 12, recordedAt: 10 }),
      entry({ id: 'b', seatId: 's2', categoryKey: 'points', value: 30, recordedAt: 20 }),
      entry({ id: 'c', seatId: 's1', categoryKey: 'points', value: 44, recordedAt: 30 }),
    ];
    const fromA = standings(simple, foldEntries(entries), seats);
    const fromB = standings(simple, foldEntries([...entries].reverse()), seats);

    expect(fromA.map((row) => [row.seat.id, row.total, row.rank])).toEqual(
      fromB.map((row) => [row.seat.id, row.total, row.rank]),
    );
  });
});

describe('compareScores', () => {
  it('reports a genuine tie as zero', () => {
    const state = foldEntries([
      entry({ seatId: 's1', categoryKey: 'points', value: 7 }),
      entry({ seatId: 's2', categoryKey: 'points', value: 7 }),
    ]);

    expect(
      compareScores(simple, scoreSeat(simple, state, 's1'), scoreSeat(simple, state, 's2')),
    ).toBe(0);
  });
});

describe('makeEntry', () => {
  const perRound: ScoreCategory = { key: 'trick', label: 'Trick', input: 'number', perRound: true };
  const final: ScoreCategory = { key: 'bonus', label: 'Bonus', input: 'number' };

  it('files a per-round value under the current round', () => {
    const built = makeEntry({
      id: 'x',
      matchId: 'm1',
      seatId: 's1',
      category: perRound,
      value: 4,
      currentRound: 3,
      recordedAt: 1,
      deviceId: 'd',
    });

    expect(built.round).toBe(3);
  });

  it('pins a non-round value to round 0 even mid-match', () => {
    const built = makeEntry({
      id: 'x',
      matchId: 'm1',
      seatId: 's1',
      category: final,
      value: 4,
      currentRound: 3,
      recordedAt: 1,
      deviceId: 'd',
    });

    expect(built.round).toBe(0);
  });
});

describe('lastRound', () => {
  it('finds the highest round holding an entry', () => {
    const state = foldEntries([
      entry({ seatId: 's1', categoryKey: 'trick', value: 1, round: 1 }),
      entry({ seatId: 's2', categoryKey: 'trick', value: 1, round: 4 }),
    ]);

    expect(lastRound(state)).toBe(4);
  });

  it('reports round 0 for an empty match', () => {
    expect(lastRound(foldEntries([]))).toBe(0);
  });
});
