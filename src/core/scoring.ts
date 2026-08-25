/**
 * The scoring engine.
 *
 * Scores are an append-only log of entries rather than a mutable total per
 * player. That choice buys three things at once:
 *
 *  - Undo and history come for free; nothing is ever overwritten in place.
 *  - Two phones editing the same match converge without a merge dialog. Each
 *    (seat, category, round) slot is a last-write-wins register, and ties on
 *    the timestamp fall back to the entry id, which is itself sortable. Every
 *    device folding the same set of entries lands on the same totals, whatever
 *    order they arrived in.
 *  - Entries from a device that was offline just slot in when it reconnects.
 *
 * Everything here is pure: no storage, no React, no clock. That is what makes
 * it testable in plain Node.
 */

import type { Seat } from './match';
import { categoryByKey, type ScoreCategory, type ScoreTemplate } from './template';

export interface ScoreEntry {
  readonly id: string;
  readonly matchId: string;
  readonly seatId: string;
  readonly categoryKey: string;
  /** 0 for categories tallied once at the end of the game. */
  readonly round: number;
  readonly value: number;
  readonly recordedAt: number;
  /** Which device wrote this. Used for attribution, never for resolution. */
  readonly deviceId: string;
}

/** Folded log: one surviving entry per (seat, category, round) slot. */
export type ScoreState = ReadonlyMap<string, ScoreEntry>;

/** ASCII unit separator: cannot appear in an id or a category key. */
const SEPARATOR = String.fromCharCode(31);

export function entryKey(seatId: string, categoryKey: string, round: number): string {
  return seatId + SEPARATOR + categoryKey + SEPARATOR + String(round);
}

/**
 * Round a value belongs to. Categories that are not per-round always live at
 * round 0, so advancing the match round never strands an earlier figure.
 */
export function roundFor(category: ScoreCategory, currentRound: number): number {
  return category.perRound === true ? currentRound : 0;
}

/** True when `candidate` supersedes `existing` under last-write-wins. */
export function supersedes(candidate: ScoreEntry, existing: ScoreEntry | undefined): boolean {
  if (existing === undefined) return true;
  if (candidate.recordedAt !== existing.recordedAt) {
    return candidate.recordedAt > existing.recordedAt;
  }
  // Same millisecond on two devices: ids are sortable, so this is a total
  // order that every device agrees on.
  return candidate.id > existing.id;
}

/** Collapses a log of entries into the current state. Order-independent. */
export function foldEntries(entries: Iterable<ScoreEntry>): ScoreState {
  const state = new Map<string, ScoreEntry>();
  for (const entry of entries) {
    const key = entryKey(entry.seatId, entry.categoryKey, entry.round);
    if (supersedes(entry, state.get(key))) {
      state.set(key, entry);
    }
  }
  return state;
}

/** The value recorded in one slot, or undefined if nothing was ever entered. */
export function valueAt(
  state: ScoreState,
  seatId: string,
  categoryKey: string,
  round: number,
): number | undefined {
  return state.get(entryKey(seatId, categoryKey, round))?.value;
}

/** Every round that holds a value for this seat and category, in order. */
export function roundsWithValues(
  state: ScoreState,
  seatId: string,
  categoryKey: string,
): number[] {
  const rounds: number[] = [];
  for (const entry of state.values()) {
    if (entry.seatId === seatId && entry.categoryKey === categoryKey) {
      rounds.push(entry.round);
    }
  }
  return rounds.sort((a, b) => a - b);
}

/**
 * Units entered for a category, before the multiplier. Per-round categories
 * accumulate across every round played; the rest hold a single figure. The
 * declared default stands in only while nothing at all has been entered.
 */
export function rawTotal(
  state: ScoreState,
  seatId: string,
  category: ScoreCategory,
): number {
  if (category.perRound === true) {
    let sum = 0;
    let found = false;
    for (const entry of state.values()) {
      if (entry.seatId === seatId && entry.categoryKey === category.key) {
        sum += entry.value;
        found = true;
      }
    }
    return found ? sum : (category.defaultValue ?? 0);
  }
  return valueAt(state, seatId, category.key, 0) ?? category.defaultValue ?? 0;
}

export interface SeatScore {
  readonly seatId: string;
  /** Final score, multipliers applied and excluded categories left out. */
  readonly total: number;
  /** Points contributed per category, after the multiplier. */
  readonly points: ReadonlyMap<string, number>;
  /** Units entered per category, before the multiplier. */
  readonly units: ReadonlyMap<string, number>;
}

export function scoreSeat(
  template: ScoreTemplate,
  state: ScoreState,
  seatId: string,
): SeatScore {
  const points = new Map<string, number>();
  const units = new Map<string, number>();
  let total = 0;

  for (const category of template.categories) {
    const raw = rawTotal(state, seatId, category);
    const scored = raw * (category.multiplier ?? 1);
    units.set(category.key, raw);
    points.set(category.key, scored);
    if (category.excludeFromTotal !== true) {
      total += scored;
    }
  }

  return { seatId, total, points, units };
}

/**
 * Orders two seats. Negative means `a` places ahead of `b`.
 *
 * Tiebreakers follow the same direction as the total: in a game where the
 * lowest score wins, the lowest tiebreaker wins too. One rule, no surprises.
 */
export function compareScores(
  template: ScoreTemplate,
  a: SeatScore,
  b: SeatScore,
): number {
  const direction = template.lowestWins === true ? 1 : -1;
  if (a.total !== b.total) return (a.total - b.total) * direction;

  for (const key of template.tiebreakers ?? []) {
    const left = a.units.get(key) ?? 0;
    const right = b.units.get(key) ?? 0;
    if (left !== right) return (left - right) * direction;
  }
  return 0;
}

export interface Standing extends SeatScore {
  readonly seat: Seat;
  /** 1-based. Genuinely tied seats share a rank, and the next rank skips. */
  readonly rank: number;
}

export function standings(
  template: ScoreTemplate,
  state: ScoreState,
  seats: readonly Seat[],
): Standing[] {
  const scored = seats.map((seat) => ({
    seat,
    score: scoreSeat(template, state, seat.id),
  }));

  // Seat order is the final key so the list is stable, but it must not affect
  // rank: two seats level on score and tiebreakers are genuinely tied.
  scored.sort((a, b) => {
    const byScore = compareScores(template, a.score, b.score);
    return byScore !== 0 ? byScore : a.seat.order - b.seat.order;
  });

  const rows: Standing[] = [];
  let previous: SeatScore | undefined;
  let previousRank = 0;

  scored.forEach((item, index) => {
    const tiedWithPrevious =
      previous !== undefined && compareScores(template, previous, item.score) === 0;
    const rank = tiedWithPrevious ? previousRank : index + 1;
    rows.push({ ...item.score, seat: item.seat, rank });
    previous = item.score;
    previousRank = rank;
  });

  return rows;
}

/** Every seat in first place. More than one means the match ended tied. */
export function winners(rows: readonly Standing[]): Standing[] {
  return rows.filter((row) => row.rank === 1);
}

/** Highest round holding any entry, useful for resuming a round-based match. */
export function lastRound(state: ScoreState): number {
  let highest = 0;
  for (const entry of state.values()) {
    if (entry.round > highest) highest = entry.round;
  }
  return highest;
}

export interface RecordScoreInput {
  readonly id: string;
  readonly matchId: string;
  readonly seatId: string;
  readonly category: ScoreCategory;
  readonly value: number;
  readonly currentRound: number;
  readonly recordedAt: number;
  readonly deviceId: string;
}

/** Builds an entry, routing it to the correct round for its category. */
export function makeEntry(input: RecordScoreInput): ScoreEntry {
  return {
    id: input.id,
    matchId: input.matchId,
    seatId: input.seatId,
    categoryKey: input.category.key,
    round: roundFor(input.category, input.currentRound),
    value: input.value,
    recordedAt: input.recordedAt,
    deviceId: input.deviceId,
  };
}

export { categoryByKey };
