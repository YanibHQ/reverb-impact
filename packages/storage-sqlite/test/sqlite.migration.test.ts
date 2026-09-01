import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SqliteStore } from '../src/index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('SQLite migrations and runtime mode', () => {
  it('applies forward migrations idempotently and enables WAL', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'reverb-sqlite-migration-'));
    roots.push(root);
    const path = resolve(root, 'reverb.sqlite');
    const first = new SqliteStore(path);
    expect(first.migrationVersions()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(first.pragma('journal_mode')).toMatchObject({ journal_mode: 'wal' });
    first.close();

    const reopened = new SqliteStore(path);
    expect(reopened.migrationVersions()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    reopened.close();
  });

  it('supports two readers over the same WAL database', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'reverb-sqlite-readers-'));
    roots.push(root);
    const path = resolve(root, 'reverb.sqlite');
    const left = new SqliteStore(path);
    const right = new SqliteStore(path);
    expect(left.migrationVersions()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(right.migrationVersions()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    left.close();
    right.close();
  });
});
