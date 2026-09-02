import {
  commitSha,
  configRevision,
  contentHash,
  generationId,
  generationLeaseId,
  instant,
  overlayId,
  repoPath,
  registryRevision,
  repositoryStableId,
  treeHash,
  workspaceId,
  type CommitSha,
} from '@yanib/reverb-domain';
import {
  CreatePullRequestOverlayV2,
  ExecutionBudgetRepositoryReaderV2,
  ExecutionBudgetV2,
  IndexRepositoryGeneration,
  IndexRepositoryGenerationV2,
  portSuccess,
  type ExecutionBudgetTelemetryEventV2,
  type RepositoryReader,
} from '@yanib/reverb-application';
import {
  FakeClock,
  InMemoryArtifactCache,
  InMemoryGenerationStore,
  MemoryTelemetry,
} from '../src/index.js';
import { describe, expect, it, vi } from 'vitest';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000540');
const repository = repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
const config = configRevision(`cfg_sha256:${'2'.repeat(64)}`);
const registry = registryRevision(`reg_sha256:${'3'.repeat(64)}`);
const baseSha = commitSha('a'.repeat(40));
const headSha = commitSha('b'.repeat(40));
const now = instant('2026-09-02T22:30:00.000Z');
const expires = instant('2026-09-02T22:45:00.000Z');

function source(blobRead = vi.fn()): RepositoryReader {
  return {
    async resolveRepository(id) {
      return portSuccess({ id, displayName: 'budget fixture' });
    },
    async resolveCommit(id, ref) {
      return portSuccess({
        repositoryId: id,
        sha: commitSha(ref),
        treeHash: treeHash('c'.repeat(40)),
      });
    },
    async listTree(id, sha) {
      return portSuccess({
        repositoryId: id,
        commitSha: sha,
        treeHash: treeHash('c'.repeat(40)),
        entries: [
          {
            path: repoPath('source.ts'),
            mode: '100644',
            kind: 'blob',
            objectId: 'stable-source-blob',
            size: 28,
          },
        ],
        complete: true,
        limitations: [],
      });
    },
    async compare(id, base, head) {
      return portSuccess({
        repositoryId: id,
        baseSha: base,
        headSha: head,
        entries: [],
        complete: true,
        renameBasis: 'none',
        limitations: [],
        manifestHash: contentHash(`sha256:${'4'.repeat(64)}`),
      });
    },
    async readBlob(_id, _sha, path, maximumBytes) {
      blobRead(path, maximumBytes);
      const bytes = new TextEncoder().encode('export const value = true;\n').slice(0, maximumBytes);
      return portSuccess({
        path,
        bytes,
        complete: true,
        truncated: false,
        sourceBlobId: 'stable-source-blob',
        limitations: [],
      });
    },
  };
}

function overlaySource(blobRead = vi.fn()): RepositoryReader {
  return {
    ...source(blobRead),
    async compare(id, base, head) {
      return portSuccess({
        repositoryId: id,
        baseSha: base,
        headSha: head,
        entries: [
          {
            kind: 'modified',
            path: repoPath('source.ts'),
            binary: false,
            submodule: false,
          },
        ],
        complete: true,
        renameBasis: 'none',
        limitations: [],
        manifestHash: contentHash(`sha256:${'5'.repeat(64)}`),
      });
    },
  };
}

const limits = {
  providerRequests: 3,
  sourceBytes: 64,
  storageQueries: 32,
  artifacts: 1,
  modelTokens: 0,
  latencyMs: 1_000,
} as const;

function request(
  sequence: number,
  sha: CommitSha,
  previousGenerationId?: ReturnType<typeof generationId>,
) {
  return {
    generationId: generationId(
      `gen_01990f64-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`,
    ),
    leaseId: generationLeaseId(
      `lea_01990f64-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`,
    ),
    leaseExpiresAt: expires,
    workspaceId: workspace,
    registryRevision: registry,
    repositoryId: repository,
    commitSha: sha,
    configRevision: config,
    indexerBundleVersion: 'budget-v2-test',
    ...(previousGenerationId === undefined ? {} : { previousGenerationId }),
  };
}

describe('bounded v2 generation indexing', () => {
  it('passes only the remaining source-byte allowance to the provider', async () => {
    const blobRead = vi.fn();
    const budget = new ExecutionBudgetV2(
      'pull_request',
      { ...limits, providerRequests: 1, sourceBytes: 10 },
      new FakeClock(now),
    );
    const bounded = new ExecutionBudgetRepositoryReaderV2(source(blobRead), budget);
    const result = await bounded.readBlob(repository, headSha, repoPath('source.ts'), 64);
    expect(result).toMatchObject({ ok: true, value: { bytes: { byteLength: 10 } } });
    expect(blobRead).toHaveBeenCalledWith(repoPath('source.ts'), 10);
    expect(budget.complete().usage).toMatchObject({ providerRequests: 1, sourceBytes: 10 });
  });

  it('accounts bootstrap provider, source, storage, artifact, and latency usage', async () => {
    const result = await new IndexRepositoryGenerationV2({
      reader: source(),
      store: new InMemoryGenerationStore(),
      cache: new InMemoryArtifactCache(),
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute({ ...request(1, baseSha), executionBudget: limits });
    expect(result).toMatchObject({
      ok: true,
      value: {
        lane: 'bootstrap_index',
        state: 'complete',
        legacyResult: { state: 'complete', artifactCount: 1, reusedArtifactCount: 0 },
        executionBudget: {
          lane: 'bootstrap_index',
          usage: {
            providerRequests: 3,
            sourceBytes: 27,
            storageQueries: 6,
            artifacts: 1,
            latencyMs: 0,
          },
        },
      },
    });
  });

  it('keeps an incremental lane independent and reuses unchanged content without blob reads', async () => {
    const blobRead = vi.fn();
    const reader = source(blobRead);
    const store = new InMemoryGenerationStore();
    const indexer = new IndexRepositoryGenerationV2({
      reader,
      store,
      cache: new InMemoryArtifactCache(),
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    });
    const base = await indexer.execute({ ...request(2, baseSha), executionBudget: limits });
    if (!base.ok) throw new Error(base.failure.code);
    blobRead.mockClear();
    const incremental = await indexer.execute({
      ...request(3, headSha, base.value.legacyResult.generationId),
      executionBudget: limits,
    });
    expect(incremental).toMatchObject({
      ok: true,
      value: {
        lane: 'incremental_index',
        state: 'complete',
        legacyResult: { reusedArtifactCount: 1 },
        executionBudget: {
          lane: 'incremental_index',
          usage: { providerRequests: 2, sourceBytes: 0, artifacts: 1 },
        },
      },
    });
    expect(blobRead).not.toHaveBeenCalled();
  });

  it('fails before blob access and closes telemetry when the artifact budget is exhausted', async () => {
    const blobRead = vi.fn();
    const events: ExecutionBudgetTelemetryEventV2[] = [];
    const store = new InMemoryGenerationStore();
    const result = await new IndexRepositoryGenerationV2({
      reader: source(blobRead),
      store,
      cache: new InMemoryArtifactCache(),
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
      executionTelemetry: { emit: (event) => events.push(event) },
    }).execute({
      ...request(4, baseSha),
      executionBudget: { ...limits, artifacts: 0 },
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { code: 'execution_budget_exceeded', retryable: false },
    });
    expect(blobRead).not.toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual([
      'execution_budget_exhausted',
      'execution_budget_completed',
    ]);
    expect(await store.getGeneration(request(4, baseSha).generationId)).toMatchObject({
      ok: true,
      value: { state: 'failed', selectable: false },
    });
  });

  it('closes an acquired generation lease after storage-budget exhaustion', async () => {
    const store = new InMemoryGenerationStore();
    const generationRequest = request(8, baseSha);
    const result = await new IndexRepositoryGenerationV2({
      reader: source(),
      store,
      cache: new InMemoryArtifactCache(),
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute({
      ...generationRequest,
      executionBudget: { ...limits, storageQueries: 2 },
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { code: 'execution_budget_exceeded', retryable: false },
    });
    expect(await store.getGeneration(generationRequest.generationId)).toMatchObject({
      ok: true,
      value: { state: 'failed', selectable: false },
    });
  });

  it('closes execution telemetry when a provider throws', async () => {
    const events: ExecutionBudgetTelemetryEventV2[] = [];
    const reader = source();
    reader.resolveCommit = vi.fn(async () => {
      throw new Error('provider unavailable');
    });
    const execution = new IndexRepositoryGenerationV2({
      reader,
      store: new InMemoryGenerationStore(),
      cache: new InMemoryArtifactCache(),
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
      executionTelemetry: { emit: (event) => events.push(event) },
    }).execute({ ...request(7, baseSha), executionBudget: limits });
    await expect(execution).rejects.toThrow('provider unavailable');
    expect(events.map((event) => event.type)).toEqual(['execution_budget_completed']);
  });

  it('preserves the exact legacy result under a generous v2 budget', async () => {
    const legacy = await new IndexRepositoryGeneration({
      reader: source(),
      store: new InMemoryGenerationStore(),
      cache: new InMemoryArtifactCache(),
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute(request(5, baseSha));
    const bounded = await new IndexRepositoryGenerationV2({
      reader: source(),
      store: new InMemoryGenerationStore(),
      cache: new InMemoryArtifactCache(),
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute({ ...request(5, baseSha), executionBudget: limits });
    expect(legacy.ok).toBe(true);
    expect(bounded.ok).toBe(true);
    if (legacy.ok && bounded.ok) expect(bounded.value.legacyResult).toEqual(legacy.value);
  });

  it('applies an independent pull-request budget to exact overlay construction', async () => {
    const store = new InMemoryGenerationStore();
    const base = await new IndexRepositoryGeneration({
      reader: source(),
      store,
      cache: new InMemoryArtifactCache(),
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute(request(6, baseSha));
    if (!base.ok) throw new Error(base.failure.code);
    const result = await new CreatePullRequestOverlayV2({
      reader: overlaySource(),
      store,
      clock: new FakeClock(now),
      telemetry: new MemoryTelemetry(),
    }).execute({
      overlayId: overlayId('ovl_01990f64-0000-7000-8000-000000000540'),
      leaseId: generationLeaseId('lea_01990f64-0000-7000-8000-000000000541'),
      leaseExpiresAt: expires,
      workspaceId: workspace,
      registryRevision: registry,
      repositoryId: repository,
      baseGenerationId: base.value.generationId,
      baseSha,
      headSha,
      configRevision: config,
      indexerBundleVersion: 'budget-v2-test',
      supersessionKey: contentHash(`sha256:${'6'.repeat(64)}`),
      executionBudget: {
        ...limits,
        providerRequests: 4,
      },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        lane: 'pull_request',
        state: 'complete',
        legacyResult: { state: 'complete', entryCount: 1 },
        executionBudget: {
          lane: 'pull_request',
          usage: {
            providerRequests: 4,
            sourceBytes: 27,
            artifacts: 1,
          },
        },
      },
    });
  });
});
