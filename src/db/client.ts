import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { LATEST_VERSION, pendingMigrations } from './migrations';
import * as schema from './schema';

const DATABASE_NAME = 'mesa.db';

let handle: SQLiteDatabase | undefined;
let database: ExpoSQLiteDatabase<typeof schema> | undefined;

/**
 * The raw expo-sqlite handle. Needed for pragmas and migrations, which sit
 * below the level Drizzle models.
 */
export function getSqliteHandle(): SQLiteDatabase {
  if (handle === undefined) {
    // The change listener is what makes `useLiveQuery` work: any write, from
    // this screen or from an incoming sync, re-renders whatever is on screen.
    handle = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });
    handle.execSync('PRAGMA journal_mode = WAL');
    handle.execSync('PRAGMA foreign_keys = ON');
  }
  return handle;
}

export function getDb(): ExpoSQLiteDatabase<typeof schema> {
  if (database === undefined) {
    database = drizzle(getSqliteHandle(), { schema });
  }
  return database;
}

/**
 * Brings the local database up to the latest schema version. Safe to call on
 * every launch: already-applied migrations are skipped.
 */
export async function runMigrations(): Promise<number> {
  const sqlite = getSqliteHandle();
  const row = await sqlite.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  for (const migration of pendingMigrations(currentVersion)) {
    if (!Number.isInteger(migration.version)) {
      throw new Error(`Migration version must be an integer: ${migration.version}`);
    }
    await sqlite.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await sqlite.execAsync(statement);
      }
      // PRAGMA does not accept bound parameters; the value is one of our own
      // integers, checked just above.
      await sqlite.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }

  return LATEST_VERSION;
}

/** Test and development helper: drops every table and re-migrates. */
export async function resetDatabase(): Promise<void> {
  const sqlite = getSqliteHandle();
  await sqlite.execAsync('PRAGMA foreign_keys = OFF');
  for (const table of ['outbox', 'score_entries', 'seats', 'matches', 'players', 'meta']) {
    await sqlite.execAsync(`DROP TABLE IF EXISTS ${table}`);
  }
  await sqlite.execAsync('PRAGMA user_version = 0');
  await sqlite.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations();
}
