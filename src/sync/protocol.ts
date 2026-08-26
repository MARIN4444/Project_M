/**
 * Translation between what the phone stores and what the server stores.
 *
 * The two schemas hold the same information but speak differently: SQLite uses
 * camelCase columns and epoch milliseconds, Postgres uses snake_case and
 * timestamptz. Every field crosses that border exactly once, here, so a
 * mistake shows up in one file rather than scattered through the sync code.
 *
 * This module is pure on purpose -- it imports no client, no storage and no
 * React, only types. That is what lets the mapping be tested in plain Node,
 * which matters because a dropped field in a mapper is silent: nothing throws,
 * the data simply stops arriving.
 */

import type { MatchRow, ScoreEntryRow, SeatRow, PlayerRow } from '@/db/schema';

/* -------------------------------------------------------------------------- */
/* Time                                                                        */
/* -------------------------------------------------------------------------- */

/** Epoch milliseconds to the ISO form Postgres accepts for timestamptz. */
export function toIso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/** Back again. Anything unparseable becomes 0 rather than NaN, which would
 *  poison every comparison downstream. */
export function fromIso(iso: string | null): number {
  if (iso === null) return 0;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/* -------------------------------------------------------------------------- */
/* Row shapes on the server                                                    */
/* -------------------------------------------------------------------------- */

export interface RemotePlayer {
  id: string;
  group_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface RemoteMatch {
  id: string;
  group_id: string;
  template_id: string;
  game_name: string;
  bgg_id: number | null;
  join_code: string;
  status: 'setup' | 'live' | 'finished';
  round: number;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
}

export interface RemoteSeat {
  id: string;
  group_id: string;
  match_id: string;
  player_id: string;
  player_name: string;
  seat_order: number;
  color: string | null;
  claimed_by: string | null;
}

export interface RemoteScoreEntry {
  id: string;
  group_id: string;
  match_id: string;
  seat_id: string;
  category_key: string;
  round: number;
  value: number;
  /** Kept as epoch milliseconds: this is the ordering key the fold compares,
   *  and round-tripping it through a timestamp risks losing precision. */
  recorded_at: number;
  device_id: string;
}

/* -------------------------------------------------------------------------- */
/* Local to remote                                                             */
/* -------------------------------------------------------------------------- */

export function playerToRemote(row: PlayerRow, groupId: string): RemotePlayer {
  return {
    id: row.id,
    group_id: groupId,
    name: row.name,
    color: row.color,
    created_at: toIso(row.createdAt),
  };
}

export function matchToRemote(row: MatchRow, groupId: string): RemoteMatch {
  return {
    id: row.id,
    group_id: groupId,
    template_id: row.templateId,
    game_name: row.gameName,
    bgg_id: row.bggId,
    join_code: row.joinCode,
    status: row.status,
    round: row.round,
    started_at: toIso(row.startedAt),
    finished_at: row.finishedAt === null ? null : toIso(row.finishedAt),
    notes: row.notes,
  };
}

export function seatToRemote(row: SeatRow, groupId: string): RemoteSeat {
  return {
    id: row.id,
    group_id: groupId,
    match_id: row.matchId,
    player_id: row.playerId,
    player_name: row.playerName,
    seat_order: row.order,
    color: row.color,
    claimed_by: row.claimedBy,
  };
}

export function scoreEntryToRemote(row: ScoreEntryRow, groupId: string): RemoteScoreEntry {
  return {
    id: row.id,
    group_id: groupId,
    match_id: row.matchId,
    seat_id: row.seatId,
    category_key: row.categoryKey,
    round: row.round,
    value: row.value,
    recorded_at: row.recordedAt,
    device_id: row.deviceId,
  };
}

/* -------------------------------------------------------------------------- */
/* Remote to local                                                             */
/* -------------------------------------------------------------------------- */

export function playerFromRemote(remote: RemotePlayer): PlayerRow {
  return {
    id: remote.id,
    name: remote.name,
    color: remote.color,
    createdAt: fromIso(remote.created_at),
    groupId: remote.group_id,
  };
}

export function matchFromRemote(remote: RemoteMatch): MatchRow {
  return {
    id: remote.id,
    templateId: remote.template_id,
    gameName: remote.game_name,
    bggId: remote.bgg_id,
    joinCode: remote.join_code,
    status: remote.status,
    round: remote.round,
    startedAt: fromIso(remote.started_at),
    finishedAt: remote.finished_at === null ? null : fromIso(remote.finished_at),
    notes: remote.notes,
    groupId: remote.group_id,
  };
}

export function seatFromRemote(remote: RemoteSeat): SeatRow {
  return {
    id: remote.id,
    matchId: remote.match_id,
    playerId: remote.player_id,
    playerName: remote.player_name,
    order: remote.seat_order,
    color: remote.color,
    claimedBy: remote.claimed_by,
    groupId: remote.group_id,
  };
}

export function scoreEntryFromRemote(remote: RemoteScoreEntry): ScoreEntryRow {
  return {
    id: remote.id,
    matchId: remote.match_id,
    seatId: remote.seat_id,
    categoryKey: remote.category_key,
    round: remote.round,
    value: remote.value,
    recordedAt: remote.recorded_at,
    deviceId: remote.device_id,
    groupId: remote.group_id,
  };
}

/* -------------------------------------------------------------------------- */
/* Pull cursor                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * How far back to reach beyond the last thing we saw.
 *
 * Rows become visible to a reader in commit order, not in `synced_at` order,
 * so a transaction that started before our last pull can commit after it and
 * carry an older stamp. Asking for a few seconds of overlap catches those.
 *
 * The overlap is free precisely because of how scores are stored: entries are
 * immutable and the fold keeps one per slot, so receiving the same row twice
 * changes nothing. A design that merged partial updates could not do this.
 */
export const CURSOR_OVERLAP_MS = 10_000;

/** The `synced_at` to ask the server for. Undefined cursor means "everything". */
export function resumeFrom(
  cursor: string | undefined,
  overlapMs: number = CURSOR_OVERLAP_MS,
): string {
  if (cursor === undefined) return new Date(0).toISOString();
  const from = fromIso(cursor) - overlapMs;
  return new Date(Math.max(0, from)).toISOString();
}

/**
 * The cursor to store after a batch. Only ever moves forward, so an
 * out-of-order page can never rewind progress already made.
 */
export function advanceCursor(
  rows: readonly { synced_at: string }[],
  previous: string | undefined,
): string | undefined {
  let highest = previous === undefined ? 0 : fromIso(previous);
  let moved = previous !== undefined;

  for (const row of rows) {
    const at = fromIso(row.synced_at);
    if (at > highest) {
      highest = at;
      moved = true;
    }
  }

  return moved ? new Date(highest).toISOString() : undefined;
}
