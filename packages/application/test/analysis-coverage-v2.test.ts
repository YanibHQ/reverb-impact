import {
  adapterId,
  commitSha,
  configRevision,
  contentHash,
  createRegistrySnapshot,
  finalizeAdapterFamilyCoverageV2,
  finalizeAnalysisScope,
  finalizeRepositoryAnalysisCoverageV2,
  generationId,
  hashCanonical,
  instant,
  prepareAnalysisScope,
  repositoryStableId,
  workspaceId,
} from '@yanib/reverb-domain';
import { composeAnalysisCoverageV2, portSuccess } from '../src/index.js';
import { describe, expect, it, vi } from 'vitest';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000520');
const producer = repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
const canary = repositoryStableId(`local:sha256:${'9'.repeat(64)}`);
const generation = generationId('gen_01990f64-0000-7000-8000-000000000520');
const sha = commitSha('a'.repeat(40));
const now = instant('2026-09-02T21:30:00.000Z');

function resolvedScope() {
  const registry = createRegistrySnapshot({
    workspaceId: workspace,
    sequence: 1,
    createdAt: now,
    createdBy: 'coverage-test',
    source: 'fixture',
    reason: 'scoped coverage',
    repositories: [
      {
        repositoryId: producer,
        alias: 'producer',
        defaultBranch: 'main',
        collections: ['default'],
        selected: true,
        consentRevision: 'producer-consent',
      },
      {
        repositoryId: canary,
        alias: 'canary',
        defaultBranch: 'main',
        collections: ['default'],
        selected: true,
        consentRevision: 'canary-consent',
      },
    ],
  });
  const prepared = prepareAnalysisScope({
    registry,
    producerRepositoryId: producer,
    consumerScope: { mode: 'allowlist', repositoryIds: [] },
    consentGrantee: 'host',
  });
  return finalizeAnalysisScope({
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
}

const selection = {
  repositoryId: producer,
  state: 'current' as const,
  generationId: generation,
  commitSha: sha,
  selectedAt: now,
  freshnessAgeMs: 0,
  coverageState: 'complete' as const,
};

function completeRepository(scope: ReturnType<typeof resolvedScope>['provenance']) {
  return finalizeRepositoryAnalysisCoverageV2({
    workspaceId: workspace,
    registryRevision: scope.registryRevision,
    repositoryId: producer,
    role: 'producer_consumer',
    selectionState: 'current',
    generationId: generation,
    commitSha: sha,
    selectedAt: now,
    freshnessAgeMs: 0,
    families: [
      finalizeAdapterFamilyCoverageV2({
        family: 'events',
        state: 'complete',
        eligibleArtifacts: 1,
        processedArtifacts: 1,
        skippedArtifacts: 0,
        failedArtifacts: 0,
        adapters: [
          {
            adapterId: adapterId('adapter.events'),
            adapterVersion: '0.5.0',
            extractionVersion: '1',
            identityVersion: 1,
            partitioningVersion: 1,
            compatibilityVersion: '1',
            configRevision: configRevision(`cfg_sha256:${'2'.repeat(64)}`),
            outputHash: contentHash(`sha256:${'3'.repeat(64)}`),
          },
        ],
        limitations: [],
      }),
    ],
  });
}

describe('composeAnalysisCoverageV2', () => {
  it('does not query coverage storage when all new families are disabled', async () => {
    const resolved = resolvedScope();
    const readRepositoryCoverage = vi.fn();
    const coverage = await composeAnalysisCoverageV2({
      scope: resolved.provenance,
      capability: resolved.capability,
      enabledFamilies: [],
      selections: [selection],
      source: { readRepositoryCoverage },
    });
    expect(coverage.state).toBe('complete');
    expect(coverage.repositories[0]?.families).toEqual([]);
    expect(readRepositoryCoverage).not.toHaveBeenCalled();
  });

  it('accepts canonical family coverage only for the exact scoped generation', async () => {
    const resolved = resolvedScope();
    const readRepositoryCoverage = vi.fn(async () =>
      portSuccess(completeRepository(resolved.provenance)),
    );
    const coverage = await composeAnalysisCoverageV2({
      scope: resolved.provenance,
      capability: resolved.capability,
      enabledFamilies: ['events'],
      selections: [selection],
      source: { readRepositoryCoverage },
    });
    expect(coverage.state).toBe('complete');
    expect(readRepositoryCoverage).toHaveBeenCalledOnce();
    expect(readRepositoryCoverage.mock.calls[0]?.[1]).toMatchObject({
      repositoryId: producer,
      generationId: generation,
      commitSha: sha,
    });
  });

  it('turns missing or mismatched records into explicit partial coverage', async () => {
    const resolved = resolvedScope();
    const mismatched = {
      ...completeRepository(resolved.provenance),
      repositoryId: canary,
    };
    const coverage = await composeAnalysisCoverageV2({
      scope: resolved.provenance,
      capability: resolved.capability,
      enabledFamilies: ['events'],
      selections: [selection],
      source: { readRepositoryCoverage: async () => portSuccess(mismatched) },
    });
    expect(coverage).toMatchObject({
      state: 'partial',
      repositories: [
        {
          repositoryId: producer,
          families: [
            {
              family: 'events',
              state: 'not_analysed',
              limitations: [{ code: 'family_coverage_unavailable' }],
            },
          ],
        },
      ],
    });
  });

  it('does not allow stored coverage to relabel a stale selection as current', async () => {
    const resolved = resolvedScope();
    const coverage = await composeAnalysisCoverageV2({
      scope: resolved.provenance,
      capability: resolved.capability,
      enabledFamilies: ['events'],
      selections: [{ ...selection, state: 'stale', freshnessAgeMs: 86_400_001 }],
      source: {
        readRepositoryCoverage: async () => portSuccess(completeRepository(resolved.provenance)),
      },
    });
    expect(coverage).toMatchObject({
      state: 'partial',
      repositories: [
        {
          selectionState: 'stale',
          families: [{ state: 'not_analysed' }],
        },
      ],
    });
  });

  it('never queries a source for a repository without a selected generation', async () => {
    const resolved = resolvedScope();
    const readRepositoryCoverage = vi.fn();
    const coverage = await composeAnalysisCoverageV2({
      scope: resolved.provenance,
      capability: resolved.capability,
      enabledFamilies: ['events'],
      selections: [
        { repositoryId: producer, state: 'not_indexed', reason: 'repository_not_indexed' },
      ],
      source: { readRepositoryCoverage },
    });
    expect(coverage.state).toBe('partial');
    expect(readRepositoryCoverage).not.toHaveBeenCalled();
  });
});
