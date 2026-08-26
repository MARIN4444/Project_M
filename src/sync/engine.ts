import { eq, inArray } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { getActiveGroupId, markOutboxSent, pendingOutbox } from '@/db/repository';
import { matches, meta, players, scoreEntries, seats } from '@/db/schema';

import {
  advanceCursor,
  matchFromRemote,
  matchToRemote,
  playerFromRemote,
  playerToRemote,
  resumeFrom,
  scoreEntryFromRemote,
  scoreEntryToRemote,
  seatFromRemote,
  seatToRemote,
  type RemoteMatch,
  type RemotePlayer,
  type RemoteScoreEntry,
  type RemoteSeat,
} from './protocol';
import { ensureSession } from './session';
import { getSupabase, isSyncConfigured } from './supabase';

/**
 * Moving a group's matches between phones.
 *
 * Push does not replay the outbox payloads. It treats the outbox as a list of
 * *what changed* and re-reads the current row from SQLite before sending it.
 * That makes a push idempotent, collapses repeated edits to the same row into
 * one write, and sidesteps having to reconcile partial payloads that were
 * queued at different moments.
 *
 * Pull asks for everything stamped since the last cursor, minus a small
 * overlap, and folds it in. Receiving a row twice is harmless: matches and
 * seats are upserted by primary key, and score entries are immutable, so the
 * second copy is identical to the first.
 *
 * Neither half is allowed to throw at the caller. A failed sync is an ordinary
 * condition -- the phone is in a basement -- and the app has to keep working
 * through it. Failures are reported in the result, not raised.
 */

/* -------------------------------------------------------------------------- */
/* Cursors                                                                     */
/* -------------------------------------------------------------------------- */

type Syncable = 'players' | 'matches' | 'seats' | 'score_entries';

const cursorKey = (group: string, table: Syncable) => `cursor:${group}:${table}`;

async function readCursor(group: string, table: Syncable): Promise<string | undefined> {
  const rows = await getDb()
    .select()
    .from(meta)
    .where(eq(meta.key, cursorKey(group, table)))
    .limit(1);
  return rows[0]?.value;
}

async function writeCursor(group: string, table: Syncable, value: string): Promise<void> {
  const db = getDb();
  const key = cursorKey(group, table);
  const existing = await readCursor(group, table);
  if (existing === undefined) {
    await db.insert(meta).values({ key, value });
  } else {
    await db.update(meta).set({ value }).where(eq(meta.key, key));
  }
}

/* -------------------------------------------------------------------------- */
/* Push                                                                        */
/* -------------------------------------------------------------------------- */

export interface SyncResult {
  readonly pushed: number;
  readonly pulled: number;
  readonly error?: string;
}

/**
 * Sends everything queued locally. Rows are pushed in dependency order, since
 * a seat whose match has not arrived yet would be rejected by the foreign key.
 */
async function push(groupId: string): Promise<number> {
  const db = getDb();
  const supabase = getSupabase();
  const queued = await pendingOutbox(500);
  if (queued.length === 0) return 0;

  const upserts = { match: new Set<string>(), seat: new Set<string>(), score_entry: new Set<string>() };
  const deletes = { match: new Set<string>(), seat: new Set<string>(), score_entry: new Set<string>() };

  for (const row of queued) {
    const bucket = row.operation === 'delete' ? deletes : upserts;
    bucket[row.entity].add(row.entityId);
  }

  // Players are not queued individually; they ride along with the matches that
  // seat them, which is enough to keep names resolvable on another device.
  const localPlayers = await db.select().from(players).where(eq(players.groupId, groupId));
  if (localPlayers.length > 0) {
    const payload: RemotePlayer[] = localPlayers.map((row) => playerToRemote(row, groupId));
    const { error } = await supabase.from('players').upsert(payload, { onConflict: 'id' });
    if (error !== null) throw new Error(`players: ${error.message}`);
  }

  if (upserts.match.size > 0) {
    const rows = await db
      .select()
      .from(matches)
      .where(inArray(matches.id, [...upserts.match]));
    const payload: RemoteMatch[] = rows
      .filter((row) => row.groupId === groupId)
      .map((row) => matchToRemote(row, groupId));
    if (payload.length > 0) {
      const { error } = await supabase.from('matches').upsert(payload, { onConflict: 'id' });
      if (error !== null) throw new Error(`matches: ${error.message}`);
    }
  }

  if (upserts.seat.size > 0) {
    const rows = await db.select().from(seats).where(inArray(seats.id, [...upserts.seat]));
    const payload: RemoteSeat[] = rows
      .filter((row) => row.groupId === groupId)
      .map((row) => seatToRemote(row, groupId));
    if (payload.length > 0) {
      const { error } = await supabase.from('seats').upsert(payload, { onConflict: 'id' });
      if (error !== null) throw new Error(`seats: ${error.message}`);
    }
  }

  // Seats belonging to a match we just pushed may not have their own outbox
  // row, so send every seat of every touched match.
  if (upserts.match.size > 0) {
    const rows = await db
      .select()
      .from(seats)
      .where(inArray(seats.matchId, [...upserts.match]));
    const payload: RemoteSeat[] = rows
      .filter((row) => row.groupId === groupId)
      .map((row) => seatToRemote(row, groupId));
    if (payload.length > 0) {
      const { error } = await supabase.from('seats').upsert(payload, { onConflict: 'id' });
      if (error !== null) throw new Error(`seats: ${error.message}`);
    }
  }

  if (upserts.score_entry.size > 0) {
    const rows = await db
      .select()
      .from(scoreEntries)
      .where(inArray(scoreEntries.id, [...upserts.score_entry]));
    const payload: RemoteScoreEntry[] = rows
      .filter((row) => row.groupId === groupId)
      .map((row) => scoreEntryToRemote(row, groupId));
    if (payload.length > 0) {
      // Entries never change once written, so a repeat is the same row.
      const { error } = await supabase
        .from('score_entries')
        .upsert(payload, { onConflict: 'id', ignoreDuplicates: true });
      if (error !== null) throw new Error(`score_entries: ${error.message}`);
    }
  }

  // Deletions go the other way round: children before parents.
  if (deletes.score_entry.size > 0) {
    const { error } = await supabase
      .from('score_entries')
      .delete()
      .in('id', [...deletes.score_entry]);
    if (error !== null) throw new Error(`delete score_entries: ${error.message}`);
  }

  if (deletes.match.size > 0) {
    const { error } = await supabase.from('matches').delete().in('id', [...deletes.match]);
    if (error !== null) throw new Error(`delete matches: ${error.message}`);
  }

  await markOutboxSent(queued.map((row) => row.id));
  return queued.length;
}

/* -------------------------------------------------------------------------- */
/* Pull                                                                        */
/* -------------------------------------------------------------------------- */

const PAGE = 1000;

async function pull(groupId: string): Promise<number> {
  const db = getDb();
  const supabase = getSupabase();
  let received = 0;

  const fetchSince = async (table: Syncable) => {
    const cursor = await readCursor(groupId, table);
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('group_id', groupId)
      .gte('synced_at', resumeFrom(cursor))
      .order('synced_at', { ascending: true })
      .limit(PAGE);

    if (error !== null) throw new Error(`${table}: ${error.message}`);
    return { rows: (data ?? []) as { synced_at: string }[], cursor };
  };

  const players_ = await fetchSince('players');
  for (const raw of players_.rows) {
    const row = playerFromRemote(raw as unknown as RemotePlayer);
    await db.insert(players).values(row).onConflictDoUpdate({ target: players.id, set: row });
  }
  received += players_.rows.length;

  const matches_ = await fetchSince('matches');
  for (const raw of matches_.rows) {
    const row = matchFromRemote(raw as unknown as RemoteMatch);
    await db.insert(matches).values(row).onConflictDoUpdate({ target: matches.id, set: row });
  }
  received += matches_.rows.length;

  const seats_ = await fetchSince('seats');
  for (const raw of seats_.rows) {
    const row = seatFromRemote(raw as unknown as RemoteSeat);
    await db.insert(seats).values(row).onConflictDoUpdate({ target: seats.id, set: row });
  }
  received += seats_.rows.length;

  const entries_ = await fetchSince('score_entries');
  for (const raw of entries_.rows) {
    const row = scoreEntryFromRemote(raw as unknown as RemoteScoreEntry);
    // Immutable: if it is already here it is already correct.
    await db.insert(scoreEntries).values(row).onConflictDoNothing();
  }
  received += entries_.rows.length;

  // Cursors move only after the rows are safely in SQLite. Crashing halfway
  // means the next pull fetches the same page again, which is harmless.
  const advance = async (table: Syncable, result: { rows: { synced_at: string }[]; cursor?: string }) => {
    const next = advanceCursor(result.rows, result.cursor);
    if (next !== undefined) await writeCursor(groupId, table, next);
  };

  await advance('players', players_);
  await advance('matches', matches_);
  await advance('seats', seats_);
  await advance('score_entries', entries_);

  return received;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

let running = false;

/**
 * One round trip. Safe to call often: overlapping calls collapse into the one
 * already running, and a failure is reported rather than thrown.
 */
export async function syncNow(): Promise<SyncResult> {
  if (!isSyncConfigured()) return { pushed: 0, pulled: 0 };
  if (running) return { pushed: 0, pulled: 0 };

  const groupId = await getActiveGroupId();
  if (groupId === undefined) return { pushed: 0, pulled: 0 };

  const userId = await ensureSession();
  if (userId === undefined) {
    return { pushed: 0, pulled: 0, error: 'Sin conexión' };
  }

  running = true;
  try {
    const pushed = await push(groupId);
    const pulled = await pull(groupId);
    return { pushed, pulled };
  } catch (error: unknown) {
    return {
      pushed: 0,
      pulled: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    running = false;
  }
}

/* -------------------------------------------------------------------------- */
/* Live updates                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Watches one match while it is being played, so a score entered on another
 * phone lands in this device's SQLite. The screens are already driven by live
 * queries over that database, so they redraw without knowing sync exists.
 */
export function watchMatch(matchId: string, onChange?: () => void): () => void {
  if (!isSyncConfigured()) return () => {};

  const supabase = getSupabase();
  const channel = supabase
    .channel(`match:${matchId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'score_entries', filter: `match_id=eq.${matchId}` },
      () => {
        void syncNow().then(() => onChange?.());
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
      () => {
        void syncNow().then(() => onChange?.());
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
