import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color'),
  createdAt: integer('created_at').notNull(),
});

export const matches = sqliteTable(
  'matches',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id').notNull(),
    gameName: text('game_name').notNull(),
    bggId: integer('bgg_id'),
    joinCode: text('join_code').notNull(),
    status: text('status').$type<'setup' | 'live' | 'finished'>().notNull(),
    round: integer('round').notNull().default(0),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    notes: text('notes'),
  },
  (table) => [
    index('matches_status_started_idx').on(table.status, table.startedAt),
    uniqueIndex('matches_join_code_idx').on(table.joinCode),
  ],
);

export const seats = sqliteTable(
  'seats',
  {
    id: text('id').primaryKey(),
    matchId: text('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    playerId: text('player_id').notNull(),
    playerName: text('player_name').notNull(),
    order: integer('seat_order').notNull(),
    color: text('color'),
    claimedBy: text('claimed_by'),
  },
  (table) => [
    index('seats_match_idx').on(table.matchId, table.order),
    uniqueIndex('seats_match_player_idx').on(table.matchId, table.playerId),
  ],
);

/**
 * Append-only. Rows are never updated in place: correcting a score writes a
 * newer entry for the same slot and the engine folds them. Undo, history and
 * multi-device convergence all fall out of that.
 */
export const scoreEntries = sqliteTable(
  'score_entries',
  {
    id: text('id').primaryKey(),
    matchId: text('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    seatId: text('seat_id').notNull(),
    categoryKey: text('category_key').notNull(),
    round: integer('round').notNull().default(0),
    value: integer('value').notNull(),
    recordedAt: integer('recorded_at').notNull(),
    deviceId: text('device_id').notNull(),
  },
  (table) => [
    index('score_entries_match_idx').on(table.matchId),
    index('score_entries_slot_idx').on(table.seatId, table.categoryKey, table.round),
  ],
);

/**
 * Local writes waiting to reach the server.
 *
 * Every mutation lands in SQLite first and is queued here, so the app works
 * with no signal at all and the queue drains when connectivity returns. This
 * is the seam the cloud sync plugs into; nothing above it needs to know
 * whether the network exists.
 */
export const outbox = sqliteTable(
  'outbox',
  {
    id: text('id').primaryKey(),
    entity: text('entity').$type<'match' | 'seat' | 'score_entry'>().notNull(),
    entityId: text('entity_id').notNull(),
    operation: text('operation').$type<'upsert' | 'delete'>().notNull(),
    payload: text('payload').notNull(),
    createdAt: integer('created_at').notNull(),
    /** Null while pending; set once the server has acknowledged the row. */
    sentAt: integer('sent_at'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (table) => [index('outbox_pending_idx').on(table.sentAt, table.createdAt)],
);

export type MetaRow = typeof meta.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
export type MatchRow = typeof matches.$inferSelect;
export type SeatRow = typeof seats.$inferSelect;
export type ScoreEntryRow = typeof scoreEntries.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;
