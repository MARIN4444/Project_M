/**
 * Schema migrations, applied in order and tracked with SQLite's own
 * `user_version`.
 *
 * Drizzle types the queries; the schema itself is managed here as plain SQL on
 * purpose. Generated migrations would need drizzle-kit in the build and a
 * Metro transformer to bundle `.sql` files, which is a lot of moving parts to
 * carry for a table list this size. Adding a migration means appending to this
 * array and never editing an earlier entry.
 */
export interface Migration {
  readonly version: number;
  readonly statements: readonly string[];
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        color TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY NOT NULL,
        template_id TEXT NOT NULL,
        game_name TEXT NOT NULL,
        bgg_id INTEGER,
        join_code TEXT NOT NULL,
        status TEXT NOT NULL,
        round INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        notes TEXT
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS matches_join_code_idx ON matches (join_code)`,
      `CREATE INDEX IF NOT EXISTS matches_status_started_idx ON matches (status, started_at)`,
      `CREATE TABLE IF NOT EXISTS seats (
        id TEXT PRIMARY KEY NOT NULL,
        match_id TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        seat_order INTEGER NOT NULL,
        color TEXT,
        claimed_by TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS seats_match_idx ON seats (match_id, seat_order)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS seats_match_player_idx ON seats (match_id, player_id)`,
      `CREATE TABLE IF NOT EXISTS score_entries (
        id TEXT PRIMARY KEY NOT NULL,
        match_id TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
        seat_id TEXT NOT NULL,
        category_key TEXT NOT NULL,
        round INTEGER NOT NULL DEFAULT 0,
        value INTEGER NOT NULL,
        recorded_at INTEGER NOT NULL,
        device_id TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS score_entries_match_idx ON score_entries (match_id)`,
      `CREATE INDEX IF NOT EXISTS score_entries_slot_idx
        ON score_entries (seat_id, category_key, round)`,
      `CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        sent_at INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox (sent_at, created_at)`,
    ],
  },
];

export const LATEST_VERSION = MIGRATIONS.reduce(
  (highest, migration) => Math.max(highest, migration.version),
  0,
);

/** Migrations still to run against a database at `currentVersion`. */
export function pendingMigrations(currentVersion: number): readonly Migration[] {
  return MIGRATIONS.filter((migration) => migration.version > currentVersion).sort(
    (a, b) => a.version - b.version,
  );
}
