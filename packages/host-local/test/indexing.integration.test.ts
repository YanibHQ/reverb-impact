import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
} from '@yanib/reverb-domain';
import {
  CreatePullRequestOverlay,
  IndexRepositoryGeneration,
  type RepositoryReader,
} from '@yanib/reverb-application';
import {
  FakeClock,
  InMemoryArtifactCache,
  InMemoryGenerationStore,
  MemoryTelemetry,
} from '@yanib/reverb-testkit';
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

function readerWithMismatchedBlobId(delegate: LocalGitRepositoryReader): RepositoryReader {
  return {
    resolveRepository: (id) => delegate.resolveRepository(id),
    resolveCommit: (id, ref) => delegate.resolveCommit(id, ref),
    listTree: (id, sha) => delegate.listTree(id, sha),
    compare: (id, base, head) => delegate.compare(id, base, head),
    readBlob: async (id, sha, path, maximumBytes) => {
      const result = await delegate.readBlob(id, sha, path, maximumBytes);
      return result.ok
        ? { ok: true, value: { ...result.value, sourceBlobId: '0'.repeat(64) } }
        : result;
    },
  };
}

function readerWithoutSize(
  delegate: LocalGitRepositoryReader,
  pathWithoutSize: string,
): RepositoryReader {
  return {
    resolveRepository: (id) => delegate.resolveRepository(id),
    resolveCommit: (id, ref) => delegate.resolveCommit(id, ref),
    compare: (id, base, head) => delegate.compare(id, base, head),
    readBlob: (id, sha, path, maximumBytes) => delegate.readBlob(id, sha, path, maximumBytes),
    listTree: async (id, sha) => {
      const result = await delegate.listTree(id, sha);
      return result.ok
        ? {
            ok: true,
            value: {
              ...result.value,
              entries: result.value.entries.map((entry) =>
                entry.path === pathWithoutSize
                  ? {
                      path: entry.path,
                      mode: entry.mode,
                      kind: entry.kind,
                      objectId: entry.objectId,
                    }
                  : entry,
              ),
            },
          }
        : result;
    },
  };
}

function id(prefix: 'gen' | 'lea' | 'ovl', sequence: number): string {
  return `${prefix}_01990f64-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

describe('generation and overlay orchestration', () => {
  it('rejects blobs whose identity does not match the exact tree entry', async () => {
    await writeFile(resolve(root, 'source.ts'), 'export const value = 1;\n');
    await git('add', '--all');
    await git('commit', '-m', 'blob identity base');
    const baseSha = commitSha(await git('rev-parse', 'HEAD'));
    const reader = source();
    const mismatchedReader = readerWithMismatchedBlobId(reader);

    const rejectedGeneration = await new IndexRepositoryGeneration({
      reader: mismatchedReader,
      store: new InMemoryGenerationStore(),
      cache: new InMemoryArtifactCache(),
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute({
      generationId: generationId(id('gen', 20)),
      leaseId: generationLeaseId(id('lea', 20)),
      leaseExpiresAt: expires,
      workspaceId: workspace,
      registryRevision: registry,
      repositoryId: repository,
      commitSha: baseSha,
      configRevision: config,
      indexerBundleVersion: 'foundation-1.0.0',
    });
    expect(rejectedGeneration).toMatchObject({
      ok: false,
      failure: { code: 'blob_scope_mismatch' },
    });

    const store = new InMemoryGenerationStore();
    const base = await new IndexRepositoryGeneration({
      reader,
      store,
      cache: new InMemoryArtifactCache(),
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute({
      generationId: generationId(id('gen', 21)),
      leaseId: generationLeaseId(id('lea', 21)),
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

    await writeFile(resolve(root, 'source.ts'), 'export const value = 2;\n');
    await git('add', '--all');
    await git('commit', '-m', 'blob identity head');
    const headSha = commitSha(await git('rev-parse', 'HEAD'));
    const rejectedOverlay = await new CreatePullRequestOverlay({
      reader: mismatchedReader,
      store,
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute({
      overlayId: overlayId(id('ovl', 21)),
      leaseId: generationLeaseId(id('lea', 22)),
      leaseExpiresAt: expires,
      workspaceId: workspace,
      registryRevision: registry,
      repositoryId: repository,
      baseGenerationId: base.value.generationId,
      baseSha,
      headSha,
      configRevision: config,
      indexerBundleVersion: 'foundation-1.0.0',
      supersessionKey: contentHash(`sha256:${'7'.repeat(64)}`),
    });
    expect(rejectedOverlay).toMatchObject({
      ok: false,
      failure: { code: 'blob_scope_mismatch' },
    });
  });

  it('does not reuse a prior artifact below a reduced byte limit when tree size is absent', async () => {
    await writeFile(resolve(root, 'source.ts'), `export const value = '${'x'.repeat(100)}';\n`);
    await writeFile(resolve(root, 'marker.ts'), 'export const marker = 1;\n');
    await git('add', '--all');
    await git('commit', '-m', 'byte limit base');
    const baseSha = commitSha(await git('rev-parse', 'HEAD'));

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
      generationId: generationId(id('gen', 30)),
      leaseId: generationLeaseId(id('lea', 30)),
      leaseExpiresAt: expires,
      workspaceId: workspace,
      registryRevision: registry,
      repositoryId: repository,
      commitSha: baseSha,
      configRevision: config,
      indexerBundleVersion: 'foundation-1.0.0',
      maximumFileBytes: 1_024,
    });
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    await writeFile(resolve(root, 'marker.ts'), 'export const marker = 2;\n');
    await git('add', '--all');
    await git('commit', '-m', 'byte limit head');
    const headSha = commitSha(await git('rev-parse', 'HEAD'));
    const limited = await new IndexRepositoryGeneration({
      reader: readerWithoutSize(reader, 'source.ts'),
      store,
      cache,
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute({
      generationId: generationId(id('gen', 31)),
      leaseId: generationLeaseId(id('lea', 31)),
      leaseExpiresAt: expires,
      workspaceId: workspace,
      registryRevision: registry,
      repositoryId: repository,
      commitSha: headSha,
      configRevision: config,
      indexerBundleVersion: 'foundation-1.0.0',
      previousGenerationId: base.value.generationId,
      maximumFileBytes: 10,
    });
    expect(limited.ok).toBe(true);
    if (!limited.ok) return;
    expect(limited.value.reusedArtifactCount).toBe(0);

    const artifacts = await store.listArtifacts(limited.value.generationId);
    expect(artifacts.ok).toBe(true);
    if (artifacts.ok) {
      expect(artifacts.value).toContainEqual(
        expect.objectContaining({ path: 'source.ts', parseState: 'failed' }),
      );
    }
  });

  it('keeps path-sensitive classifications separate for identical Git blobs', async () => {
    const identical = 'export const copied = true;\n';
    await mkdir(resolve(root, 'vendor'), { recursive: true });
    await writeFile(resolve(root, 'source.ts'), identical);
    await writeFile(resolve(root, 'vendor/source.ts'), identical);
    await git('add', '--all');
    await git('commit', '-m', 'identical blobs in distinct classifications');
    const exactSha = commitSha(await git('rev-parse', 'HEAD'));

    const store = new InMemoryGenerationStore();
    const indexed = await new IndexRepositoryGeneration({
      reader: source(),
      store,
      cache: new InMemoryArtifactCache(),
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute({
      generationId: generationId(id('gen', 4)),
      leaseId: generationLeaseId(id('lea', 4)),
      leaseExpiresAt: expires,
      workspaceId: workspace,
      registryRevision: registry,
      repositoryId: repository,
      commitSha: exactSha,
      configRevision: config,
      indexerBundleVersion: 'foundation-1.0.0',
    });
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;

    const artifacts = await store.listArtifacts(indexed.value.generationId);
    expect(artifacts.ok).toBe(true);
    if (!artifacts.ok) return;
    expect(artifacts.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'source.ts', classification: 'source' }),
        expect.objectContaining({ path: 'vendor/source.ts', classification: 'vendored' }),
      ]),
    );
    expect(new Set(artifacts.value.map((artifact) => artifact.sourceBlobId)).size).toBe(1);
  });

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

    const overlayBuilder = new CreatePullRequestOverlay({
      reader,
      store: incrementalStore,
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    });
    const overlayRequest = {
      overlayId: overlayId(id('ovl', 5)),
      leaseId: generationLeaseId(id('lea', 5)),
      leaseExpiresAt: expires,
      workspaceId: workspace,
      registryRevision: registry,
      repositoryId: repository,
      baseGenerationId: base.value.generationId,
      baseSha,
      headSha: baseSha,
      configRevision: config,
      indexerBundleVersion: 'foundation-1.0.0',
      supersessionKey: contentHash(`sha256:${'5'.repeat(64)}`),
    } as const;
    const crossWorkspace = await overlayBuilder.execute({
      ...overlayRequest,
      workspaceId: workspaceId('wsp_01990f64-0000-7000-8000-000000000099'),
    });
    expect(crossWorkspace).toMatchObject({
      ok: false,
      failure: { code: 'base_generation_mismatch' },
    });
    const incompatibleConfig = await overlayBuilder.execute({
      ...overlayRequest,
      overlayId: overlayId(id('ovl', 6)),
      leaseId: generationLeaseId(id('lea', 6)),
      configRevision: configRevision(`cfg_sha256:${'6'.repeat(64)}`),
    });
    expect(incompatibleConfig).toMatchObject({
      ok: false,
      failure: { code: 'base_generation_mismatch' },
    });
    const incompatibleRegistry = await overlayBuilder.execute({
      ...overlayRequest,
      overlayId: overlayId(id('ovl', 7)),
      leaseId: generationLeaseId(id('lea', 7)),
      registryRevision: registryRevision(`reg_sha256:${'7'.repeat(64)}`),
    });
    expect(incompatibleRegistry).toMatchObject({
      ok: false,
      failure: { code: 'base_generation_mismatch' },
    });

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
