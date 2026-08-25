/**
 * Everything the app does to local storage.
 *
 * Two rules hold throughout:
 *
 *  1. Writes go to SQLite first and are queued in the outbox for the server.
 *     Nothing above this layer needs to know whether there is a network. That
 *     is what lets a match be scored in a basement with no signal.
 *  2. Scores are appended, never updated. Correcting a figure writes a newer
 *     entry for the same slot; `foldEntries` decides which one counts.
 */

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import { newId, newJoinCode } from '@/core/ids';
import type { Match, Player, Seat } from '@/core/match';
import { makeEntry, type ScoreEntry } from '@/core/scoring';
import { clampToCategory, type ScoreCategory, type ScoreTemplate } from '@/core/template';

import { getDb, getSqliteHandle } from './client';
import {
  matches,
  meta,
  outbox,
  players,
  scoreEntries,
  seats,
  type MatchRow,
  type PlayerRow,
  type ScoreEntryRow,
  type SeatRow,
} from './schema';

/* -------------------------------------------------------------------------- */
/* Row mapping                                                                 */
/* -------------------------------------------------------------------------- */

// SQLite stores absent values as null; the domain model uses undefined.

function toMatch(row: MatchRow): Match {
  return {
    id: row.id,
    templateId: row.templateId,
    gameName: row.gameName,
    bggId: row.bggId ?? undefined,
    joinCode: row.joinCode,
    status: row.status,
    round: row.round,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function toSeat(row: SeatRow): Seat {
  return {
    id: row.id,
    matchId: row.matchId,
    playerId: row.playerId,
    playerName: row.playerName,
    order: row.order,
    color: row.color ?? undefined,
    claimedBy: row.claimedBy ?? undefined,
  };
}

function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? undefined,
    createdAt: row.createdAt,
  };
}

function toEntry(row: ScoreEntryRow): ScoreEntry {
  return {
    id: row.id,
    matchId: row.matchId,
    seatId: row.seatId,
    categoryKey: row.categoryKey,
    round: row.round,
    value: row.value,
    recordedAt: row.recordedAt,
    deviceId: row.deviceId,
  };
}

/* -------------------------------------------------------------------------- */
/* Device identity                                                             */
/* -------------------------------------------------------------------------- */

const DEVICE_ID_KEY = 'device-id';
let cachedDeviceId: string | undefined;

/** Stable per-install id, used to attribute entries to the phone that wrote them. */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId !== undefined) return cachedDeviceId;

  const db = getDb();
  const rows = await db.select().from(meta).where(eq(meta.key, DEVICE_ID_KEY)).limit(1);
  const existing = rows[0]?.value;
  if (existing !== undefined) {
    cachedDeviceId = existing;
    return existing;
  }

  const created = newId('dev');
  await db.insert(meta).values({ key: DEVICE_ID_KEY, value: created });
  cachedDeviceId = created;
  return created;
}

/* -------------------------------------------------------------------------- */
/* Outbox                                                                      */
/* -------------------------------------------------------------------------- */

type OutboxEntity = 'match' | 'seat' | 'score_entry';

async function enqueue(
  entity: OutboxEntity,
  entityId: string,
  operation: 'upsert' | 'delete',
  payload: unknown,
): Promise<void> {
  await getDb()
    .insert(outbox)
    .values({
      id: newId('ob'),
      entity,
      entityId,
      operation,
      payload: JSON.stringify(payload),
      createdAt: Date.now(),
    });
}

/** Rows still waiting to reach the server, oldest first. */
export async function pendingOutbox(limit = 100) {
  return getDb()
    .select()
    .from(outbox)
    .where(isNull(outbox.sentAt))
    .orderBy(asc(outbox.createdAt))
    .limit(limit);
}

export async function markOutboxSent(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = Date.now();
  await Promise.all(
    ids.map((id) => getDb().update(outbox).set({ sentAt: now }).where(eq(outbox.id, id))),
  );
}

/* -------------------------------------------------------------------------- */
/* Players                                                                     */
/* -------------------------------------------------------------------------- */

export async function listPlayers(): Promise<Player[]> {
  const rows = await getDb().select().from(players).orderBy(asc(players.name));
  return rows.map(toPlayer);
}

/**
 * Finds a player by name, creating them if this is the first time they sit
 * down. Names are matched case-insensitively so "ana" and "Ana" stay one
 * person across game nights.
 */
export async function ensurePlayer(name: string, color?: string): Promise<Player> {
  const trimmed = name.trim();
  if (trimmed === '') throw new Error('A player needs a name.');

  const db = getDb();
  const existing = await db
    .select()
    .from(players)
    .where(sql`lower(${players.name}) = lower(${trimmed})`)
    .limit(1);

  const found = existing[0];
  if (found !== undefined) return toPlayer(found);

  const player: PlayerRow = {
    id: newId('ply'),
    name: trimmed,
    color: color ?? null,
    createdAt: Date.now(),
  };
  await db.insert(players).values(player);
  return toPlayer(player);
}

/* -------------------------------------------------------------------------- */
/* Matches                                                                     */
/* -------------------------------------------------------------------------- */

export interface CreateMatchInput {
  readonly template: ScoreTemplate;
  readonly gameName: string;
  readonly bggId?: number;
  /** Seated in the order given; that is also the turn order. */
  readonly players: readonly { readonly name: string; readonly color?: string }[];
}

/** Picks a join code no live match is already using. */
async function allocateJoinCode(): Promise<string> {
  const db = getDb();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = newJoinCode();
    const clash = await db.select().from(matches).where(eq(matches.joinCode, code)).limit(1);
    if (clash.length === 0) return code;
  }
  // Vanishingly unlikely with a 32^4 space, but a longer code beats a crash.
  return newJoinCode(6);
}

export async function createMatch(input: CreateMatchInput): Promise<Match> {
  if (input.players.length === 0) {
    throw new Error('A match needs at least one player.');
  }

  const db = getDb();
  const now = Date.now();
  const seated = await Promise.all(
    input.players.map((player) => ensurePlayer(player.name, player.color)),
  );

  const row: MatchRow = {
    id: newId('mtc'),
    templateId: input.template.id,
    gameName: input.gameName.trim() === '' ? input.template.name : input.gameName.trim(),
    bggId: input.bggId ?? null,
    joinCode: await allocateJoinCode(),
    status: 'live',
    // Round-based sheets read better starting at 1; the engine treats a single
    // final tally as round 0.
    round: input.template.rounds === true ? 1 : 0,
    startedAt: now,
    finishedAt: null,
    notes: null,
  };

  const seatRows: SeatRow[] = seated.map((player, index) => ({
    id: newId('sea'),
    matchId: row.id,
    playerId: player.id,
    playerName: player.name,
    order: index,
    color: input.players[index]?.color ?? player.color ?? null,
    claimedBy: null,
  }));

  await getSqliteHandle().withTransactionAsync(async () => {
    await db.insert(matches).values(row);
    for (const seat of seatRows) {
      await db.insert(seats).values(seat);
    }
  });

  await enqueue('match', row.id, 'upsert', { match: row, seats: seatRows });

  return toMatch(row);
}

export async function getMatch(id: string): Promise<Match | undefined> {
  const rows = await getDb().select().from(matches).where(eq(matches.id, id)).limit(1);
  const row = rows[0];
  return row === undefined ? undefined : toMatch(row);
}

export async function findMatchByJoinCode(code: string): Promise<Match | undefined> {
  const rows = await getDb()
    .select()
    .from(matches)
    .where(eq(matches.joinCode, code.trim().toUpperCase()))
    .limit(1);
  const row = rows[0];
  return row === undefined ? undefined : toMatch(row);
}

export async function listMatches(limit = 50): Promise<Match[]> {
  const rows = await getDb()
    .select()
    .from(matches)
    .orderBy(desc(matches.startedAt))
    .limit(limit);
  return rows.map(toMatch);
}

export async function setRound(matchId: string, round: number): Promise<void> {
  const next = Math.max(0, Math.trunc(round));
  await getDb().update(matches).set({ round: next }).where(eq(matches.id, matchId));
  await enqueue('match', matchId, 'upsert', { id: matchId, round: next });
}

export async function finishMatch(matchId: string): Promise<void> {
  const finishedAt = Date.now();
  await getDb()
    .update(matches)
    .set({ status: 'finished', finishedAt })
    .where(eq(matches.id, matchId));
  await enqueue('match', matchId, 'upsert', { id: matchId, status: 'finished', finishedAt });
}

export async function reopenMatch(matchId: string): Promise<void> {
  await getDb()
    .update(matches)
    .set({ status: 'live', finishedAt: null })
    .where(eq(matches.id, matchId));
  await enqueue('match', matchId, 'upsert', { id: matchId, status: 'live', finishedAt: null });
}

export async function deleteMatch(matchId: string): Promise<void> {
  // Seats and entries go with it: both declare ON DELETE CASCADE and the
  // connection runs with foreign keys on.
  await getDb().delete(matches).where(eq(matches.id, matchId));
  await enqueue('match', matchId, 'delete', { id: matchId });
}

/* -------------------------------------------------------------------------- */
/* Seats                                                                       */
/* -------------------------------------------------------------------------- */

export async function listSeats(matchId: string): Promise<Seat[]> {
  const rows = await getDb()
    .select()
    .from(seats)
    .where(eq(seats.matchId, matchId))
    .orderBy(asc(seats.order));
  return rows.map(toSeat);
}

/**
 * Marks a seat as driven by this device. Leaving every seat unclaimed is the
 * everyone-on-one-phone case, which is why this is optional rather than part
 * of creating a match.
 */
export async function claimSeat(seatId: string, deviceId: string | null): Promise<void> {
  await getDb().update(seats).set({ claimedBy: deviceId }).where(eq(seats.id, seatId));
  await enqueue('seat', seatId, 'upsert', { id: seatId, claimedBy: deviceId });
}

/* -------------------------------------------------------------------------- */
/* Scores                                                                      */
/* -------------------------------------------------------------------------- */

export interface RecordScoreArgs {
  readonly matchId: string;
  readonly seatId: string;
  readonly category: ScoreCategory;
  readonly value: number;
  readonly currentRound: number;
}

/**
 * Appends a score. The value is clamped to whatever the category declares, so
 * an impossible figure never reaches storage in the first place.
 */
export async function recordScore(args: RecordScoreArgs): Promise<ScoreEntry> {
  const entry = makeEntry({
    id: newId('scr'),
    matchId: args.matchId,
    seatId: args.seatId,
    category: args.category,
    value: clampToCategory(args.category, args.value),
    currentRound: args.currentRound,
    recordedAt: Date.now(),
    deviceId: await getDeviceId(),
  });

  await getDb().insert(scoreEntries).values(entry);
  await enqueue('score_entry', entry.id, 'upsert', entry);

  return entry;
}

export async function listEntries(matchId: string): Promise<ScoreEntry[]> {
  const rows = await getDb()
    .select()
    .from(scoreEntries)
    .where(eq(scoreEntries.matchId, matchId))
    .orderBy(asc(scoreEntries.recordedAt));
  return rows.map(toEntry);
}

/**
 * Removes the newest entry in one slot so the previous figure surfaces again.
 * This is the only place a score row is ever deleted, and it is what "undo"
 * means: step back one write, not erase the history.
 */
export async function undoScore(
  seatId: string,
  categoryKey: string,
  round: number,
): Promise<ScoreEntry | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(scoreEntries)
    .where(
      and(
        eq(scoreEntries.seatId, seatId),
        eq(scoreEntries.categoryKey, categoryKey),
        eq(scoreEntries.round, round),
      ),
    )
    .orderBy(desc(scoreEntries.recordedAt), desc(scoreEntries.id))
    .limit(1);

  const newest = rows[0];
  if (newest === undefined) return undefined;

  await db.delete(scoreEntries).where(eq(scoreEntries.id, newest.id));
  await enqueue('score_entry', newest.id, 'delete', { id: newest.id });

  return toEntry(newest);
}

/* -------------------------------------------------------------------------- */
/* Live queries                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Query builders for `useLiveQuery`. Because the SQLite handle is opened with
 * its change listener enabled, anything built here re-renders on every write
 * to the underlying table, whether it came from this screen or from an
 * incoming sync.
 */
export const liveQueries = {
  match: (matchId: string) =>
    getDb().select().from(matches).where(eq(matches.id, matchId)).limit(1),

  seats: (matchId: string) =>
    getDb().select().from(seats).where(eq(seats.matchId, matchId)).orderBy(asc(seats.order)),

  entries: (matchId: string) =>
    getDb().select().from(scoreEntries).where(eq(scoreEntries.matchId, matchId)),

  recentMatches: (limit = 50) =>
    getDb().select().from(matches).orderBy(desc(matches.startedAt)).limit(limit),

  players: () => getDb().select().from(players).orderBy(asc(players.name)),
};

export { toEntry, toMatch, toPlayer, toSeat };
