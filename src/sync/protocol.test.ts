import { describe, expect, it } from 'vitest';

import type { MatchRow, PlayerRow, ScoreEntryRow, SeatRow } from '@/db/schema';

import {
  advanceCursor,
  fromIso,
  matchFromRemote,
  matchToRemote,
  playerFromRemote,
  playerToRemote,
  resumeFrom,
  scoreEntryFromRemote,
  scoreEntryToRemote,
  seatFromRemote,
  seatToRemote,
  toIso,
  CURSOR_OVERLAP_MS,
} from './protocol';

describe('time', () => {
  it('round-trips a millisecond exactly', () => {
    const now = 1_756_000_000_123;
    expect(fromIso(toIso(now))).toBe(now);
  });

  it('treats a missing timestamp as zero, never NaN', () => {
    expect(fromIso(null)).toBe(0);
    expect(fromIso('no es una fecha')).toBe(0);
  });
});

describe('match mapping', () => {
  const row: MatchRow = {
    id: 'mtc_1',
    templateId: 'catan',
    gameName: 'Catán',
    bggId: 13,
    joinCode: 'WXYZ',
    status: 'live',
    round: 2,
    startedAt: 1_756_000_000_000,
    finishedAt: null,
    notes: null,
    groupId: 'grp_1',
  };

  it('survives a round trip without losing a field', () => {
    expect(matchFromRemote(matchToRemote(row, 'grp_1'))).toEqual(row);
  });

  it('carries a finished match back and forth', () => {
    const finished: MatchRow = { ...row, status: 'finished', finishedAt: 1_756_000_999_000 };
    expect(matchFromRemote(matchToRemote(finished, 'grp_1'))).toEqual(finished);
  });

  it('stamps the group it is being sent under', () => {
    expect(matchToRemote(row, 'grp_otro').group_id).toBe('grp_otro');
  });

  it('renames columns to what Postgres expects', () => {
    const remote = matchToRemote(row, 'grp_1');
    expect(remote.game_name).toBe('Catán');
    expect(remote.template_id).toBe('catan');
    expect(remote.bgg_id).toBe(13);
  });
});

describe('seat mapping', () => {
  const row: SeatRow = {
    id: 'sea_1',
    matchId: 'mtc_1',
    playerId: 'ply_1',
    playerName: 'Ana',
    order: 0,
    color: '#C4553B',
    claimedBy: null,
    groupId: 'grp_1',
  };

  it('survives a round trip', () => {
    expect(seatFromRemote(seatToRemote(row, 'grp_1'))).toEqual(row);
  });

  it('maps seat order to its reserved column name', () => {
    expect(seatToRemote(row, 'grp_1').seat_order).toBe(0);
  });
});

describe('score entry mapping', () => {
  const row: ScoreEntryRow = {
    id: 'scr_1',
    matchId: 'mtc_1',
    seatId: 'sea_1',
    categoryKey: 'cities',
    round: 0,
    value: -5,
    recordedAt: 1_756_000_000_456,
    deviceId: 'dev_1',
    groupId: 'grp_1',
  };

  it('survives a round trip', () => {
    expect(scoreEntryFromRemote(scoreEntryToRemote(row, 'grp_1'))).toEqual(row);
  });

  it('keeps recordedAt as exact milliseconds', () => {
    // This is the value last-write-wins compares. A timestamp round trip that
    // rounded it would make two devices disagree about who wrote last.
    expect(scoreEntryToRemote(row, 'grp_1').recorded_at).toBe(1_756_000_000_456);
  });

  it('carries negative values, which some scoresheets need', () => {
    expect(scoreEntryFromRemote(scoreEntryToRemote(row, 'grp_1')).value).toBe(-5);
  });
});

describe('player mapping', () => {
  const row: PlayerRow = {
    id: 'ply_1',
    name: 'Ana',
    color: null,
    createdAt: 1_756_000_000_000,
    groupId: 'grp_1',
  };

  it('survives a round trip', () => {
    expect(playerFromRemote(playerToRemote(row, 'grp_1'))).toEqual(row);
  });
});

describe('resumeFrom', () => {
  it('asks for everything when there is no cursor', () => {
    expect(resumeFrom(undefined)).toBe(new Date(0).toISOString());
  });

  it('reaches back by the overlap window', () => {
    const cursor = new Date(1_756_000_000_000).toISOString();
    expect(fromIso(resumeFrom(cursor))).toBe(1_756_000_000_000 - CURSOR_OVERLAP_MS);
  });

  it('never reaches before the epoch', () => {
    expect(fromIso(resumeFrom(new Date(500).toISOString()))).toBe(0);
  });
});

describe('advanceCursor', () => {
  it('moves to the newest row in the batch', () => {
    const next = advanceCursor(
      [
        { synced_at: new Date(100).toISOString() },
        { synced_at: new Date(300).toISOString() },
        { synced_at: new Date(200).toISOString() },
      ],
      undefined,
    );
    expect(fromIso(next ?? null)).toBe(300);
  });

  it('never rewinds when a batch only holds older rows', () => {
    const previous = new Date(500).toISOString();
    const next = advanceCursor([{ synced_at: new Date(100).toISOString() }], previous);
    expect(fromIso(next ?? null)).toBe(500);
  });

  it('keeps the previous cursor when the batch is empty', () => {
    const previous = new Date(500).toISOString();
    expect(advanceCursor([], previous)).toBe(previous);
  });

  it('stays undefined when there is nothing at all', () => {
    expect(advanceCursor([], undefined)).toBeUndefined();
  });

  it('is idempotent: re-reading the same batch does not move it', () => {
    const rows = [{ synced_at: new Date(300).toISOString() }];
    const once = advanceCursor(rows, undefined);
    expect(advanceCursor(rows, once)).toBe(once);
  });
});
