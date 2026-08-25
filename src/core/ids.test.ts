import { describe, expect, it } from 'vitest';

import { createIdFactory, newJoinCode } from './ids';

/** Deterministic byte source: fills every byte with the same value. */
function fixedBytes(value: number) {
  return (size: number) => new Uint8Array(size).fill(value);
}

describe('createIdFactory', () => {
  it('produces ids that sort in creation order across milliseconds', () => {
    let now = 1_700_000_000_000;
    const newId = createIdFactory({ clock: () => (now += 1), randomBytes: fixedBytes(0) });

    const ids = [newId(), newId(), newId()];

    expect([...ids].sort()).toEqual(ids);
  });

  it('stays monotonic within a single millisecond', () => {
    const newId = createIdFactory({ clock: () => 1_700_000_000_000, randomBytes: fixedBytes(0) });

    const ids = Array.from({ length: 50 }, () => newId());

    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(50);
  });

  it('still sorts correctly when the clock jumps backwards', () => {
    const times = [1_700_000_000_100, 1_700_000_000_000];
    let index = 0;
    const newId = createIdFactory({
      clock: () => times[Math.min(index++, times.length - 1)] ?? 0,
      randomBytes: fixedBytes(0),
    });

    const first = newId();
    const second = newId();

    // A backwards clock must not let a later id sort before an earlier one.
    expect(second > first).toBe(true);
  });

  it('is 26 characters long', () => {
    const newId = createIdFactory({ randomBytes: fixedBytes(7) });
    expect(newId()).toHaveLength(26);
  });

  it('prefixes on request without breaking sortability', () => {
    let now = 1_700_000_000_000;
    const newId = createIdFactory({ clock: () => (now += 1), randomBytes: fixedBytes(0) });

    const ids = [newId('match'), newId('match')];

    expect(ids[0]).toMatch(/^match_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect([...ids].sort()).toEqual(ids);
  });

  it('generates distinct ids under real randomness', () => {
    const newId = createIdFactory();
    const ids = new Set(Array.from({ length: 1_000 }, () => newId()));

    expect(ids.size).toBe(1_000);
  });
});

describe('newJoinCode', () => {
  it('has the requested length', () => {
    expect(newJoinCode(4, fixedBytes(0))).toHaveLength(4);
    expect(newJoinCode(6, fixedBytes(0))).toHaveLength(6);
  });

  it('never emits characters that are easy to misread aloud', () => {
    const codes = Array.from({ length: 500 }, () => newJoinCode());
    expect(codes.join('')).not.toMatch(/[IO01]/);
  });
});
