import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  classifyArtifact,
  IndexRepositoryGeneration,
  portFailure,
  portSuccess,
  type ArtifactCacheKey,
  type ArtifactCachePort,
  type CachedArtifact,
} from '@yanib/reverb-application';
import {
  adapterId,
  commitSha,
  configRevision,
  contentHash,
  generationId,
  generationLeaseId,
  instant,
  registryRevision,
  repoPath,
  repositoryStableId,
  treeHash,
  workspaceId,
  type ReverbError,
} from '@yanib/reverb-domain';
import {
  FakeClock,
  InMemoryCancellation,
  InMemoryGenerationStore,
  InMemoryRepositoryReader,
  MemoryTelemetry,
} from '@yanib/reverb-testkit';
import { afterEach, describe, expect, it } from 'vitest';

import { LocalArtifactObjectCache, LocalWorkspaceConfig } from '../src/index.js';

const roots: string[] = [];
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
const sha = commitSha('a'.repeat(40));
const canaryPath = repoPath('secrets/REVERB_TELEMETRY_CANARY.ts');

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function id(prefix: 'gen' | 'lea', sequence: number): string {
  return `${prefix}_01990f64-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

function sourceFixture(
  bytes = new TextEncoder().encode('export const secret = true;\n'),
  includeTreeSize = true,
  includeBlob = true,
): {
  reader: InMemoryRepositoryReader;
  blobId: string;
} {
  const reader = new InMemoryRepositoryReader();
  const blobId = 'b'.repeat(40);
  reader.addRepository({ id: repository, displayName: 'telemetry-canary' });
  reader.addCommit(
    { repositoryId: repository, sha, treeHash: treeHash('c'.repeat(40)) },
    {
      repositoryId: repository,
      commitSha: sha,
      treeHash: treeHash('c'.repeat(40)),
      entries: [
        {
          path: canaryPath,
          mode: '100644',
          kind: 'blob',
          objectId: blobId,
          ...(includeTreeSize ? { size: bytes.length } : {}),
        },
      ],
      complete: true,
      limitations: [],
    },
  );
  if (includeBlob) {
    reader.addBlob(repository, sha, {
      path: canaryPath,
      bytes,
      complete: true,
      truncated: false,
      sourceBlobId: blobId,
      limitations: [],
    });
  }
  return { reader, blobId };
}

function request(sequence: number, supersessionKey?: ReturnType<typeof contentHash>) {
  return {
    generationId: generationId(id('gen', sequence)),
    leaseId: generationLeaseId(id('lea', sequence)),
    leaseExpiresAt: expires,
    workspaceId: workspace,
    registryRevision: registry,
    repositoryId: repository,
    commitSha: sha,
    configRevision: config,
    indexerBundleVersion: 'foundation-1.0.0',
    ...(supersessionKey ? { supersessionKey } : {}),
  };
}

class RecordingCache implements ArtifactCachePort {
  public writes = 0;
  public failureCode: string | null = null;

  public async get(): Promise<ReturnType<typeof portSuccess<null>>> {
    return portSuccess(null);
  }

  public async put(): Promise<
    ReturnType<typeof portSuccess<void>> | ReturnType<typeof portFailure>
  > {
    this.writes += 1;
    return this.failureCode
      ? portFailure({
          kind: 'infrastructure',
          code: this.failureCode,
          safeMessage: 'Derived cache write failed.',
          retryable: true,
        })
      : portSuccess(undefined);
  }
}

describe('path, archive, and resource containment', () => {
  it('rejects traversal variants and classifies risky files without opening archives or links', () => {
    for (const path of ['../escape', '/absolute', 'src/../escape', 'src\\escape', 'src\0x']) {
      expect(() => repoPath(path)).toThrowError(
        expect.objectContaining<Partial<ReverbError>>({ code: 'invalid_path' }),
      );
    }
    const common = {
      generationId: generationId(id('gen', 20)),
      configRevision: config,
      maximumBytes: 16,
    };
    const archive = classifyArtifact({
      ...common,
      entry: {
        path: repoPath('fixtures/payload.zip'),
        mode: '100644',
        kind: 'blob',
        objectId: '1'.repeat(40),
        size: 4,
      },
      bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
    });
    expect(archive.artifact).toMatchObject({
      classification: 'unsupported',
      parseState: 'skipped',
    });

    const symlink = classifyArtifact({
      ...common,
      entry: {
        path: repoPath('outside-link'),
        mode: '120000',
        kind: 'symlink',
        objectId: '2'.repeat(40),
      },
    });
    expect(symlink.artifact).toMatchObject({ classification: 'symlink', parseState: 'skipped' });

    const submodule = classifyArtifact({
      ...common,
      entry: {
        path: repoPath('vendor/component'),
        mode: '160000',
        kind: 'submodule',
        objectId: '6'.repeat(40),
      },
    });
    expect(submodule.artifact).toMatchObject({
      classification: 'submodule',
      parseState: 'skipped',
    });

    const oversized = classifyArtifact({
      ...common,
      entry: {
        path: repoPath('large.ts'),
        mode: '100644',
        kind: 'blob',
        objectId: '3'.repeat(40),
        size: 17,
      },
    });
    expect(oversized.artifact.classification).toBe('oversized');

    const invalidUtf8 = classifyArtifact({
      ...common,
      entry: {
        path: repoPath('invalid.ts'),
        mode: '100644',
        kind: 'blob',
        objectId: '4'.repeat(40),
        size: 2,
      },
      bytes: Uint8Array.from([0xc3, 0x28]),
    });
    expect(invalidUtf8.artifact.classification).toBe('binary');
  });

  it('bounds local config aliases/nesting and reports corrupt derived cache safely', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'reverb-adversarial-config-'));
    roots.push(root);
    await LocalWorkspaceConfig.initialize(root);
    await writeFile(resolve(root, '.reverb/workspace.yaml'), 'root: &root [*root]\n');
    await expect(LocalWorkspaceConfig.load(root)).rejects.toThrow();

    const cacheRoot = resolve(root, '.reverb/corrupt-objects');
    const cache = new LocalArtifactObjectCache(cacheRoot);
    const key: ArtifactCacheKey = {
      workspaceId: workspace,
      sourceBlobId: '5'.repeat(40),
      indexerBundleVersion: 'foundation-1.0.0',
      parserId: adapterId('reverb.file-metadata'),
      parserVersion: '1.0.0',
      configRevision: config,
    };
    const artifact: CachedArtifact['artifact'] = {
      sourceBlobId: key.sourceBlobId,
      size: 1,
      language: 'text',
      classification: 'source',
      parseState: 'parsed',
      parserId: adapterId('reverb.file-metadata'),
      parserVersion: '1.0.0',
      configRevision: config,
      lineCount: 1,
    };
    expect((await cache.put({ key, artifact })).ok).toBe(true);
    const files = await readdir(cacheRoot, { recursive: true });
    const relative = files.find((file) => file.endsWith('.json'));
    expect(relative).toBeDefined();
    await writeFile(resolve(cacheRoot, relative!), '{not-json');
    const corrupted = await cache.get(key);
    expect(corrupted.ok).toBe(false);
    if (!corrupted.ok) expect(corrupted.failure.code).toBe('cache_read_failed');
  });
});

describe('parser, cancellation, storage-fault, and telemetry containment', () => {
  it('turns a parser exception into partial coverage without leaking its canary', async () => {
    const { reader } = sourceFixture();
    const store = new InMemoryGenerationStore();
    const telemetry = new MemoryTelemetry();
    const cache = new RecordingCache();
    const indexed = await new IndexRepositoryGeneration({
      reader,
      store,
      cache,
      clock: new FakeClock(now),
      telemetry,
      parser: {
        classify: async () => {
          throw new Error('REVERB_TELEMETRY_CANARY /private/source.ts secret-value');
        },
      },
    }).execute(request(30));
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;
    expect(indexed.value.state).toBe('partial');
    expect(indexed.value.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'parse_failure' })]),
    );
    expect(cache.writes).toBe(0);
    const serializedTelemetry = JSON.stringify(telemetry.events);
    expect(serializedTelemetry).not.toContain('REVERB_TELEMETRY_CANARY');
    expect(serializedTelemetry).not.toContain(String(repository));
    expect(serializedTelemetry).not.toContain(String(canaryPath));
  });

  it('records truncated input as failed file coverage and never caches it', async () => {
    const { reader } = sourceFixture(
      new TextEncoder().encode('export const long = true;\n'),
      false,
    );
    const store = new InMemoryGenerationStore();
    const cache = new RecordingCache();
    const indexed = await new IndexRepositoryGeneration({
      reader,
      store,
      cache,
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute({ ...request(31), maximumFileBytes: 4 });
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;
    expect(indexed.value.state).toBe('partial');
    expect(indexed.value.coverage.find((entry) => entry.dimension === 'file')?.failed).toBe(1);
    const artifacts = await store.listArtifacts(indexed.value.generationId);
    expect(artifacts.ok).toBe(true);
    if (artifacts.ok) expect(artifacts.value[0]?.parseState).toBe('failed');
    expect(cache.writes).toBe(0);
  });

  it('records a missing blob as explicit failed coverage rather than empty success', async () => {
    const { reader } = sourceFixture(
      new TextEncoder().encode('export const missing = true;\n'),
      false,
      false,
    );
    const store = new InMemoryGenerationStore();
    const cache = new RecordingCache();
    const indexed = await new IndexRepositoryGeneration({
      reader,
      store,
      cache,
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute(request(34));
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;
    expect(indexed.value.state).toBe('partial');
    expect(indexed.value.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'unreadable_blob' })]),
    );
    expect(indexed.value.coverage.find((entry) => entry.dimension === 'file')?.failed).toBe(1);
    expect(cache.writes).toBe(0);
  });

  it('fails a generation on disk-full cache writes and on supersession cancellation', async () => {
    const { reader } = sourceFixture();
    const diskStore = new InMemoryGenerationStore();
    const diskCache = new RecordingCache();
    diskCache.failureCode = 'disk_full';
    const diskResult = await new IndexRepositoryGeneration({
      reader,
      store: diskStore,
      cache: diskCache,
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute(request(32));
    expect(diskResult.ok).toBe(false);
    const failed = await diskStore.getGeneration(generationId(id('gen', 32)));
    expect(failed.ok).toBe(true);
    if (failed.ok) expect(failed.value.state).toBe('failed');

    const supersessionKey = contentHash(
      'sha256:9999999999999999999999999999999999999999999999999999999999999999',
    );
    const cancellation = new InMemoryCancellation();
    cancellation.setCurrent(supersessionKey, false);
    const cancelled = await new IndexRepositoryGeneration({
      reader,
      store: new InMemoryGenerationStore(),
      cache: new RecordingCache(),
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
      cancellation,
    }).execute(request(33, supersessionKey));
    expect(cancelled.ok).toBe(false);
    if (!cancelled.ok) expect(cancelled.failure.kind).toBe('cancelled');
  });
});
