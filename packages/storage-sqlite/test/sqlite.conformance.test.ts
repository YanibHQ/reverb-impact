import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  runEvidenceGraphStoreConformance,
  runGenerationStoreConformance,
  runReviewStoreConformance,
} from '@yanibhq/reverb-testkit';
import { describe, it } from 'vitest';

import { SqliteStore } from '../src/index.js';

describe('SQLite generation store conformance', () => {
  it('passes lifecycle, atomicity, selection, and overlay cases', async () => {
    const roots: string[] = [];
    try {
      await runGenerationStoreConformance(async () => {
        const root = await mkdtemp(resolve(tmpdir(), 'reverb-sqlite-conformance-'));
        roots.push(root);
        const store = new SqliteStore(resolve(root, 'reverb.sqlite'));
        return { store, close: () => store.close() };
      });
    } finally {
      await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    }
  });
});

describe('SQLite review store conformance', () => {
  it('passes append, supersession, suppression, and audit cases', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'reverb-sqlite-review-conformance-'));
    try {
      await runReviewStoreConformance(() => {
        const store = new SqliteStore(resolve(root, 'reverb.sqlite'));
        return { store, close: () => store.close() };
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('SQLite evidence graph store conformance', () => {
  it('passes temporal observation, query, invalidation, and supersession cases', async () => {
    const roots: string[] = [];
    try {
      await runEvidenceGraphStoreConformance(async () => {
        const root = await mkdtemp(resolve(tmpdir(), 'reverb-sqlite-graph-conformance-'));
        roots.push(root);
        const store = new SqliteStore(resolve(root, 'reverb.sqlite'));
        return { store, close: () => store.close() };
      });
    } finally {
      await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    }
  });
});
