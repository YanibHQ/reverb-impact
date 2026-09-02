import {
  commitSha,
  contentHash,
  createRegistrySnapshot,
  finalizeAnalysisScope,
  hashCanonical,
  instant,
  prepareAnalysisScope,
  repositoryStableId,
  workspaceId,
} from '@yanib/reverb-domain';
import {
  ScopedConsumerEvidenceReader,
  ScopedRepositoryReader,
  portSuccess,
  type EvidenceGraphStore,
  type GenerationStore,
  type RepositoryReader,
} from '../src/index.js';
import { describe, expect, it, vi } from 'vitest';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000502');
const producer = repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
const consumer = repositoryStableId(`local:sha256:${'2'.repeat(64)}`);
const canary = repositoryStableId(`local:sha256:${'9'.repeat(64)}`);
const snapshot = createRegistrySnapshot({
  workspaceId: workspace,
  sequence: 1,
  createdAt: instant('2026-09-02T20:00:00.000Z'),
  createdBy: 'scope-test',
  source: 'fixture',
  reason: 'scoped read',
  repositories: [producer, consumer, canary].map((repositoryId) => ({
    repositoryId,
    alias: repositoryId.slice(-4),
    defaultBranch: 'main',
    collections: ['default'],
    selected: true,
    consentRevision: 'consent-1',
  })),
});
const prepared = prepareAnalysisScope({
  registry: snapshot,
  producerRepositoryId: producer,
  consumerScope: { mode: 'allowlist', repositoryIds: [consumer] },
  consentGrantee: 'host',
});
const { capability } = finalizeAnalysisScope({
  prepared,
  repositories: prepared.candidates.map((candidate) => ({
    repositoryId: candidate.membership.repositoryId,
    producer: candidate.producer,
    requested: candidate.requested,
    consentRevision: candidate.membership.consentRevision,
    authorizationRevision: prepared.registryRevision,
    authorizationDecisionHash: contentHash(
      hashCanonical({ repositoryId: candidate.membership.repositoryId, allowed: true }),
    ),
  })),
});

describe('scoped lower reads', () => {
  it('rejects source access before invoking an unselected repository reader', async () => {
    const resolveRepository = vi.fn(async () =>
      portSuccess({ repositoryId: canary, provider: 'local' as const, displayName: 'canary' }),
    );
    const reader = new ScopedRepositoryReader({ resolveRepository } as unknown as RepositoryReader);
    const rejected = await reader.resolveRepository(capability, workspace, canary);
    expect(rejected).toMatchObject({
      ok: false,
      failure: { code: 'repository_outside_analysis_scope' },
    });
    expect(resolveRepository).not.toHaveBeenCalled();

    await reader.resolveRepository(capability, workspace, consumer);
    expect(resolveRepository).toHaveBeenCalledOnce();
  });

  it('rejects generation selection before invoking the store', async () => {
    const selectGeneration = vi.fn(async () => portSuccess({ state: 'not_indexed' as const }));
    const reads = new ScopedConsumerEvidenceReader(
      { selectGeneration } as unknown as GenerationStore,
      {} as EvidenceGraphStore,
    );
    const rejected = await reads.selectGeneration(capability, {
      workspaceId: workspace,
      repositoryId: canary,
      allowPartial: true,
    });
    expect(rejected).toMatchObject({
      ok: false,
      failure: { code: 'repository_outside_analysis_scope' },
    });
    expect(selectGeneration).not.toHaveBeenCalled();

    await reads.selectGeneration(capability, {
      workspaceId: workspace,
      repositoryId: consumer,
      allowPartial: true,
    });
    expect(selectGeneration).toHaveBeenCalledOnce();
  });

  it('rejects refresh before invoking an unselected provider', async () => {
    const refresh = vi.fn(async () => portSuccess(null));
    const reads = new ScopedConsumerEvidenceReader(
      {} as GenerationStore,
      {} as EvidenceGraphStore,
      { refresh },
    );
    const rejected = await reads.refreshConsumer(capability, {
      workspaceId: workspace,
      repositoryId: canary,
      maximumDurationMs: 100,
    });
    expect(rejected.ok).toBe(false);
    expect(refresh).not.toHaveBeenCalled();

    await reads.refreshConsumer(capability, {
      workspaceId: workspace,
      repositoryId: producer,
      maximumDurationMs: 100,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('never calls evidence storage when a reference request names an unselected repository', async () => {
    const readReferences = vi.fn(async () => portSuccess([]));
    const reads = new ScopedConsumerEvidenceReader(
      {} as GenerationStore,
      { readReferences } as unknown as EvidenceGraphStore,
    );
    const rejected = await reads.readReferences(capability, {
      workspaceId: workspace,
      repositories: [
        {
          repositoryId: canary,
          generationId: 'gen_01990f64-0000-7000-8000-000000000999' as never,
        },
      ],
    });
    expect(rejected.ok).toBe(false);
    expect(readReferences).not.toHaveBeenCalled();
  });

  it('preserves exact commit values for allowed source reads', async () => {
    const resolveCommit = vi.fn(async () =>
      portSuccess({ sha: commitSha('a'.repeat(40)), treeHash: commitSha('b'.repeat(40)) }),
    );
    const reader = new ScopedRepositoryReader({ resolveCommit } as unknown as RepositoryReader);
    const result = await reader.resolveCommit(capability, workspace, producer, 'HEAD');
    expect(result.ok).toBe(true);
    expect(resolveCommit).toHaveBeenCalledWith(producer, 'HEAD');
  });
});
