import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  commitSha,
  configRevision,
  contentHash,
  generationId,
  generationLeaseId,
  instant,
  overlayId,
  registryRevision,
  repositoryStableId,
  workspaceId,
} from '@yanibhq/reverb-domain';
import { CreatePullRequestOverlay, IndexRepositoryGeneration } from '@yanibhq/reverb-application';
import {
  FakeClock,
  InMemoryArtifactCache,
  InMemoryGenerationStore,
  MemoryTelemetry,
} from '@yanibhq/reverb-testkit';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalGitRepositoryReader } from '../src/index.js';

const exec = promisify(execFile);
let root = '';
const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000001');
const repository = repositoryStableId(
  'local:sha256:1111111111111111111111111111111111111111111111111111111111111111',
);
const config = configRevision(
  'cfg_sha256:2222222222222222222222222222222222222222222222222222222222222222',
);
const registry = registryRevision(
  'reg_sha256:3333333333333333333333333333333333333333333333333333333333333333',
);
const now = instant('2026-08-28T20:00:00.000Z');
const expires = instant('2026-08-28T20:15:00.000Z');

async function git(...argv: string[]): Promise<string> {
  const result = await exec('git', argv, { cwd: root, encoding: 'utf8' });
  return result.stdout.trim();
}

beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'reverb-index-integration-'));
  await git('init', '-b', 'main');
  await git('config', 'user.email', 'fixture@example.test');
  await git('config', 'user.name', 'Fixture');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function source(): LocalGitRepositoryReader {
  return new LocalGitRepositoryReader(
    new Map([[repository, { path: root, displayName: 'fixture', defaultBranch: 'main' }]]),
  );
}

function id(prefix: 'gen' | 'lea' | 'ovl', sequence: number): string {
  return `${prefix}_01990f64-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

describe('generation and overlay orchestration', () => {
  it('makes incremental and clean rebuilds semantically identical', async () => {
    await writeFile(resolve(root, 'changed.ts'), 'export const value = 1;\n');
    await writeFile(resolve(root, 'unchanged.ts'), 'export const stable = true;\n');
    await git('add', '--all');
    await git('commit', '-m', 'base');
    const baseSha = commitSha(await git('rev-parse', 'HEAD'));

    const reader = source();
    const incrementalStore = new InMemoryGenerationStore();
    const incrementalCache = new InMemoryArtifactCache();
    const telemetry = new MemoryTelemetry();
    const indexer = new IndexRepositoryGeneration({
      reader,
      store: incrementalStore,
      cache: incrementalCache,
      clock: new FakeClock(now),
      telemetry,
    });
    const base = await indexer.execute({
      generationId: generationId(id('gen', 1)),
      leaseId: generationLeaseId(id('lea', 1)),
      leaseExpiresAt: expires,
      workspaceId: workspace,
      registryRevision: registry,
      repositoryId: repository,
      commitSha: baseSha,
      configRevision: config,
      indexerBundleVersion: 'foundation-1.0.0',
    });
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    await writeFile(resolve(root, 'changed.ts'), 'export const value = 2;\n');
    await git('add', '--all');
    await git('commit', '-m', 'head');
    const headSha = commitSha(await git('rev-parse', 'HEAD'));
    const incremental = await indexer.execute({
      generationId: generationId(id('gen', 2)),
      leaseId: generationLeaseId(id('lea', 2)),
      leaseExpiresAt: expires,
      workspaceId: workspace,
      registryRevision: registry,
      repositoryId: repository,
      commitSha: headSha,
      configRevision: config,
      indexerBundleVersion: 'foundation-1.0.0',
      previousGenerationId: base.value.generationId,
    });
    expect(incremental.ok).toBe(true);
    if (!incremental.ok) return;
    expect(incremental.value.reusedArtifactCount).toBe(1);

    const cleanStore = new InMemoryGenerationStore();
    const clean = await new IndexRepositoryGeneration({
      reader,
      store: cleanStore,
      cache: new InMemoryArtifactCache(),
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute({
      generationId: generationId(id('gen', 3)),
      leaseId: generationLeaseId(id('lea', 3)),
      leaseExpiresAt: expires,
      workspaceId: workspace,
      registryRevision: registry,
      repositoryId: repository,
      commitSha: headSha,
      configRevision: config,
      indexerBundleVersion: 'foundation-1.0.0',
    });
    expect(clean.ok).toBe(true);
    if (!clean.ok) return;
    expect(clean.value.artifactResultHash).toBe(incremental.value.artifactResultHash);
    expect(clean.value.state).toBe('complete');
    expect(incremental.value.state).toBe('complete');
  });

  it('creates immutable replacement and tombstone entries for an exact head', async () => {
    await writeFile(resolve(root, 'renamed.ts'), 'export const renamed = true;\n');
    await writeFile(resolve(root, 'deleted.ts'), 'export const deleted = true;\n');
    await git('add', '--all');
    await git('commit', '-m', 'base');
    const baseSha = commitSha(await git('rev-parse', 'HEAD'));

    const reader = source();
    const store = new InMemoryGenerationStore();
    const base = await new IndexRepositoryGeneration({
      reader,
      store,
      cache: new InMemoryArtifactCache(),
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute({
      generationId: generationId(id('gen', 10)),
      leaseId: generationLeaseId(id('lea', 10)),
      leaseExpiresAt: expires,
      workspaceId: workspace,
      registryRevision: registry,
      repositoryId: repository,
      commitSha: baseSha,
      configRevision: config,
      indexerBundleVersion: 'foundation-1.0.0',
    });
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    await git('mv', 'renamed.ts', 'moved.ts');
    await rm(resolve(root, 'deleted.ts'));
    await writeFile(resolve(root, 'added.ts'), 'export const added = true;\n');
    await git('add', '--all');
    await git('commit', '-m', 'head');
    const headSha = commitSha(await git('rev-parse', 'HEAD'));
    const overlay = await new CreatePullRequestOverlay({
      reader,
      store,
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute({
      overlayId: overlayId(id('ovl', 10)),
      leaseId: generationLeaseId(id('lea', 11)),
      leaseExpiresAt: expires,
      workspaceId: workspace,
      registryRevision: registry,
      repositoryId: repository,
      baseGenerationId: base.value.generationId,
      baseSha,
      headSha,
      configRevision: config,
      indexerBundleVersion: 'foundation-1.0.0',
      supersessionKey: contentHash(
        'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ),
    });
    expect(overlay.ok).toBe(true);
    if (!overlay.ok) return;
    expect(overlay.value.state).toBe('complete');
    const entries = await store.listOverlayEntries(overlay.value.overlayId);
    expect(entries.ok).toBe(true);
    if (entries.ok) {
      expect(
        entries.value.filter((entry) => entry.kind === 'tombstone').map((entry) => entry.path),
      ).toEqual(expect.arrayContaining(['deleted.ts', 'renamed.ts']));
      expect(
        entries.value.filter((entry) => entry.kind === 'replacement').map((entry) => entry.path),
      ).toEqual(expect.arrayContaining(['added.ts', 'moved.ts']));
    }
  });

  it('keeps seeded randomized edit sequences equivalent to clean rebuilds', async () => {
    await writeFile(resolve(root, 'stable.ts'), 'export const stable = 0;\n');
    await writeFile(resolve(root, 'rename-a.ts'), 'export const renamed = true;\n');
    await writeFile(resolve(root, 'optional.ts'), 'export const optional = true;\n');
    await git('add', '--all');
    await git('commit', '-m', 'randomized-base');

    const reader = source();
    const incrementalStore = new InMemoryGenerationStore();
    const incrementalIndexer = new IndexRepositoryGeneration({
      reader,
      store: incrementalStore,
      cache: new InMemoryArtifactCache(),
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    });
    let previousGenerationId: ReturnType<typeof generationId> | undefined;
    let renameAtA = true;
    let optionalExists = true;
    const operations = fc.sample(fc.integer({ min: 0, max: 3 }), {
      seed: 2_026_082_8,
      numRuns: 8,
    });

    for (const [step, operation] of operations.entries()) {
      if (operation === 0) {
        await writeFile(resolve(root, 'stable.ts'), `export const stable = ${step + 1};\n`);
      } else if (operation === 1) {
        await writeFile(resolve(root, `added-${step}.ts`), `export const added = ${step};\n`);
      } else if (operation === 2) {
        await git(
          'mv',
          renameAtA ? 'rename-a.ts' : 'rename-b.ts',
          renameAtA ? 'rename-b.ts' : 'rename-a.ts',
        );
        renameAtA = !renameAtA;
      } else if (optionalExists) {
        await rm(resolve(root, 'optional.ts'));
        optionalExists = false;
      } else {
        await writeFile(resolve(root, 'optional.ts'), `export const optional = ${step};\n`);
        optionalExists = true;
      }
      await git('add', '--all');
      await git('commit', '-m', `randomized-${step}`);
      const exactSha = commitSha(await git('rev-parse', 'HEAD'));
      const incremental = await incrementalIndexer.execute({
        generationId: generationId(id('gen', 100 + step)),
        leaseId: generationLeaseId(id('lea', 100 + step)),
        leaseExpiresAt: expires,
        workspaceId: workspace,
        registryRevision: registry,
        repositoryId: repository,
        commitSha: exactSha,
        configRevision: config,
        indexerBundleVersion: 'foundation-1.0.0',
        ...(previousGenerationId ? { previousGenerationId } : {}),
      });
      expect(incremental.ok).toBe(true);
      if (!incremental.ok) return;
      previousGenerationId = incremental.value.generationId;

      const clean = await new IndexRepositoryGeneration({
        reader,
        store: new InMemoryGenerationStore(),
        cache: new InMemoryArtifactCache(),
        clock: new FakeClock(now),
        telemetry: new MemoryTelemetry(),
      }).execute({
        generationId: generationId(id('gen', 200 + step)),
        leaseId: generationLeaseId(id('lea', 200 + step)),
        leaseExpiresAt: expires,
        workspaceId: workspace,
        registryRevision: registry,
        repositoryId: repository,
        commitSha: exactSha,
        configRevision: config,
        indexerBundleVersion: 'foundation-1.0.0',
      });
      expect(clean.ok).toBe(true);
      if (!clean.ok) return;
      expect(incremental.value.artifactResultHash).toBe(clean.value.artifactResultHash);
      expect(incremental.value.state).toBe(clean.value.state);
      expect(incremental.value.coverage).toEqual(clean.value.coverage);
    }
  }, 30_000);

  it('invalidates reuse when config or indexer bundle compatibility changes', async () => {
    await writeFile(resolve(root, 'source.ts'), 'export const value = true;\n');
    await git('add', '--all');
    await git('commit', '-m', 'compatibility-base');
    const exactSha = commitSha(await git('rev-parse', 'HEAD'));
    const reader = source();
    const store = new InMemoryGenerationStore();
    const cache = new InMemoryArtifactCache();
    const indexer = new IndexRepositoryGeneration({
      reader,
      store,
      cache,
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    });
    const base = await indexer.execute({
      generationId: generationId(id('gen', 300)),
      leaseId: generationLeaseId(id('lea', 300)),
      leaseExpiresAt: expires,
      workspaceId: workspace,
      registryRevision: registry,
      repositoryId: repository,
      commitSha: exactSha,
      configRevision: config,
      indexerBundleVersion: 'foundation-1.0.0',
    });
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    const nextConfig = configRevision(
      'cfg_sha256:4444444444444444444444444444444444444444444444444444444444444444',
    );
    const changedConfig = await indexer.execute({
      generationId: generationId(id('gen', 301)),
      leaseId: generationLeaseId(id('lea', 301)),
      leaseExpiresAt: expires,
      workspaceId: workspace,
      registryRevision: registry,
      repositoryId: repository,
      commitSha: exactSha,
      configRevision: nextConfig,
      indexerBundleVersion: 'foundation-1.0.0',
      previousGenerationId: base.value.generationId,
    });
    expect(changedConfig.ok).toBe(true);
    if (changedConfig.ok) expect(changedConfig.value.reusedArtifactCount).toBe(0);

    const changedBundle = await indexer.execute({
      generationId: generationId(id('gen', 302)),
      leaseId: generationLeaseId(id('lea', 302)),
      leaseExpiresAt: expires,
      workspaceId: workspace,
      registryRevision: registry,
      repositoryId: repository,
      commitSha: exactSha,
      configRevision: config,
      indexerBundleVersion: 'foundation-2.0.0',
      previousGenerationId: base.value.generationId,
    });
    expect(changedBundle.ok).toBe(true);
    if (changedBundle.ok) expect(changedBundle.value.reusedArtifactCount).toBe(0);
  });
});
