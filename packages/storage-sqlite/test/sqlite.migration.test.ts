import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { analysisId } from '@yanib/reverb-domain';
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
    expect(first.migrationVersions()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(first.pragma('journal_mode')).toMatchObject({ journal_mode: 'wal' });
    first.close();

    const reopened = new SqliteStore(path);
    expect(reopened.migrationVersions()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    reopened.close();
  });

  it('supports two readers over the same WAL database', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'reverb-sqlite-readers-'));
    roots.push(root);
    const path = resolve(root, 'reverb.sqlite');
    const left = new SqliteStore(path);
    const right = new SqliteStore(path);
    expect(left.migrationVersions()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(right.migrationVersions()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    left.close();
    right.close();
  });

  it('upgrades a v0.4 migration ledger and preserves legacy analysis data', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'reverb-sqlite-v0.4-upgrade-'));
    roots.push(root);
    const path = resolve(root, 'reverb.sqlite');
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE analysis_results (
        analysis_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        producer_repository_id TEXT NOT NULL,
        supersession_key TEXT NOT NULL,
        current INTEGER NOT NULL CHECK (current IN (0, 1)),
        state TEXT NOT NULL,
        output_hash TEXT NOT NULL,
        result_json TEXT NOT NULL
      ) STRICT;
    `);
    for (let version = 1; version <= 7; version += 1) {
      legacy
        .prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(version, new Date(0).toISOString());
    }
    const legacyAnalysisId = analysisId('ana_01990f64-0000-7000-8000-000000000499');
    legacy
      .prepare(
        `INSERT INTO analysis_results(
          analysis_id, workspace_id, producer_repository_id, supersession_key,
          current, state, output_hash, result_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        legacyAnalysisId,
        'wsp_01990f64-0000-7000-8000-000000000499',
        `local:sha256:${'1'.repeat(64)}`,
        `sha256:${'2'.repeat(64)}`,
        1,
        'complete',
        `sha256:${'3'.repeat(64)}`,
        JSON.stringify({ analysisId: legacyAnalysisId, legacyCanary: 'v0.4-readable' }),
      );
    legacy.close();

    const upgraded = new SqliteStore(path);
    expect(upgraded.migrationVersions()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(await upgraded.getAnalysis(legacyAnalysisId)).toMatchObject({
      ok: true,
      value: { analysisId: legacyAnalysisId, legacyCanary: 'v0.4-readable' },
    });
    upgraded.close();
  });
});
