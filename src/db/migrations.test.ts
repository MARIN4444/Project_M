import { describe, expect, it } from 'vitest';

import { LATEST_VERSION, MIGRATIONS, pendingMigrations } from './migrations';

describe('migrations', () => {
  it('has strictly increasing, unique versions', () => {
    const versions = MIGRATIONS.map((migration) => migration.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('starts at version 1', () => {
    expect(MIGRATIONS[0]?.version).toBe(1);
  });

  it('reports the highest version as the latest', () => {
    expect(LATEST_VERSION).toBe(Math.max(...MIGRATIONS.map((m) => m.version)));
  });

  it('runs everything against a brand new database', () => {
    expect(pendingMigrations(0)).toHaveLength(MIGRATIONS.length);
  });

  it('runs nothing against an up-to-date database', () => {
    expect(pendingMigrations(LATEST_VERSION)).toEqual([]);
  });

  it('runs only what is missing from a partially migrated database', () => {
    const pending = pendingMigrations(1);
    expect(pending.every((migration) => migration.version > 1)).toBe(true);
  });

  it('never ships an empty migration', () => {
    for (const migration of MIGRATIONS) {
      expect(migration.statements.length).toBeGreaterThan(0);
    }
  });
});
