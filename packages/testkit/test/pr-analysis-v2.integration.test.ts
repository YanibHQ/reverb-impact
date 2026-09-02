import {
  adapterId,
  analysisId,
  canonicalJson,
  commitSha,
  configRevision,
  contentHash,
  createRegistrySnapshot,
  deriveStableReferenceIdV2,
  finalizeAdapterFamilyCoverageV2,
  finalizeRepositoryAnalysisCoverageV2,
  generationId,
  generationLeaseId,
  instant,
  overlayId,
  policyRevision,
  repoPath,
  repositoryStableId,
  treeHash,
  workspaceId,
} from '@yanib/reverb-domain';
import { AnalyzePullRequest, AnalyzePullRequestV2, portSuccess } from '@yanib/reverb-application';
import { describe, expect, it, vi } from 'vitest';

import {
  FakeClock,
  InMemoryAnalysisResultStoreV2,
  InMemoryAuthorization,
  InMemoryEvidenceGraphStore,
  InMemoryGenerationStore,
  InMemoryRegistry,
} from '../src/index.js';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000503');
const producer = repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
const consumer = repositoryStableId(`local:sha256:${'2'.repeat(64)}`);
const unselectedCanary = repositoryStableId(`local:sha256:${'9'.repeat(64)}`);
const baseGeneration = generationId('gen_01990f64-0000-7000-8000-000000000503');
const producerHeadGeneration = generationId('gen_01990f64-0000-7000-8000-000000000504');
const overlay = overlayId('ovl_01990f64-0000-7000-8000-000000000503');
const baseSha = commitSha('a'.repeat(40));
const headSha = commitSha('b'.repeat(40));
const now = instant('2026-09-02T20:00:00.000Z');
const later = instant('2026-09-02T20:01:00.000Z');
const config = configRevision(`cfg_sha256:${'c'.repeat(64)}`);
const hash = contentHash(`sha256:${'d'.repeat(64)}`);
const policy = policyRevision(`pol_sha256:${'e'.repeat(64)}`);
const subject = { kind: 'service' as const, id: 'host-worker' };

const snapshot = createRegistrySnapshot({
  workspaceId: workspace,
  sequence: 1,
  createdAt: now,
  createdBy: 'scope-test',
  source: 'fixture',
  reason: 'v2 orchestration',
  repositories: [producer, consumer, unselectedCanary].map((repositoryId, index) => ({
    repositoryId,
    alias: `repository-${index}`,
    defaultBranch: 'main',
    collections: ['default'],
    selected: true,
    consentRevision: `consent-${index}`,
  })),
});

async function fixture() {
  const generations = new InMemoryGenerationStore();
  const evidence = new InMemoryEvidenceGraphStore();
  const registry = new InMemoryRegistry();
  const authorization = new InMemoryAuthorization();
  const v2Results = new InMemoryAnalysisResultStoreV2();
  await registry.putRevision(snapshot);
  const generationLease = await generations.beginGeneration({
    generationId: baseGeneration,
    workspaceId: workspace,
    repositoryId: producer,
    commitSha: baseSha,
    treeHash: treeHash('f'.repeat(40)),
    indexerBundleVersion: 'v2-scope-test',
    configRevision: config,
    registryRevision: snapshot.revision.revision,
    startedAt: now,
    leaseId: generationLeaseId('lea_01990f64-0000-7000-8000-000000000503'),
    leaseExpiresAt: later,
  });
  if (!generationLease.ok) throw new Error(generationLease.failure.code);
  await generations.completeGeneration(generationLease.value, {
    state: 'complete',
    completedAt: now,
    selectable: true,
    coverage: [],
    diagnostics: [],
    coverageHash: hash,
    artifactResultHash: hash,
  });
  const overlayLease = await generations.beginOverlay({
    overlay: {
      id: overlay,
      workspaceId: workspace,
      repositoryId: producer,
      baseGenerationId: baseGeneration,
      baseSha,
      headSha,
      headTreeHash: treeHash('1'.repeat(40)),
      indexerBundleVersion: 'v2-scope-test',
      configRevision: config,
      registryRevision: snapshot.revision.revision,
      state: 'building',
      supersessionKey: hash,
      diffHash: hash,
      startedAt: now,
    },
    leaseId: generationLeaseId('lea_01990f64-0000-7000-8000-000000000504'),
    leaseExpiresAt: later,
  });
  if (!overlayLease.ok) throw new Error(overlayLease.failure.code);
  await generations.completeOverlay(overlayLease.value, overlay, {
    state: 'complete',
    completedAt: now,
    resultHash: hash,
  });
  return { generations, evidence, registry, authorization, v2Results };
}

function input(id: string) {
  return {
    schemaMajor: 2 as const,
    enabledAdapterFamilies: [],
    executionBudget: {
      providerRequests: 0,
      sourceBytes: 0,
      storageQueries: 32,
      artifacts: 32,
      modelTokens: 0,
      latencyMs: 1_000,
    },
    analysisId: analysisId(id),
    workspaceId: workspace,
    registryRevision: snapshot.revision.revision,
    policyRevision: policy,
    policyMajor: 1,
    producerRepositoryId: producer,
    baseGenerationId: baseGeneration,
    overlayId: overlay,
    pullRequest: { provider: 'local' as const, number: 12, baseSha, headSha },
    changes: [],
    producerDefinitions: [],
    producerHeadObservation: {
      workspaceId: workspace,
      repositoryId: producer,
      generationId: producerHeadGeneration,
      commitSha: headSha,
      coverageState: 'complete' as const,
      definitions: [],
      references: [],
      observedAt: now,
      outputHash: hash,
    },
    subject,
  };
}

function allow(authorization: InMemoryAuthorization, repositoryIds: readonly (typeof producer)[]) {
  for (const repositoryId of repositoryIds) {
    authorization.set(subject, 'evidence.consume', repositoryId, {
      allowed: true,
      reason: 'fixture_allow',
      revision: snapshot.revision.revision,
    });
  }
}

function producerEventsCoverage() {
  return finalizeRepositoryAnalysisCoverageV2({
    workspaceId: workspace,
    registryRevision: snapshot.revision.revision,
    repositoryId: producer,
    role: 'producer_consumer',
    selectionState: 'current',
    generationId: producerHeadGeneration,
    commitSha: headSha,
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
            adapterId: adapterId('reverb.events'),
            adapterVersion: '0.1.0',
            extractionVersion: '1',
            identityVersion: 1,
            partitioningVersion: 1,
            compatibilityVersion: '1',
            configRevision: config,
            outputHash: hash,
          },
        ],
        limitations: [],
      }),
    ],
  });
}

describe('AnalyzePullRequestV2 bounded scope', () => {
  it('keeps the nested v1 result canonically identical when all v2 families are disabled', async () => {
    const legacyDependencies = await fixture();
    const v2Dependencies = await fixture();
    allow(legacyDependencies.authorization, [producer, consumer, unselectedCanary]);
    allow(v2Dependencies.authorization, [producer, consumer, unselectedCanary]);
    const request = input('ana_01990f64-0000-7000-8000-000000000502');
    const legacy = await new AnalyzePullRequest({
      ...legacyDependencies,
      clock: new FakeClock(now),
    }).execute(request);
    const v2 = await new AnalyzePullRequestV2({
      ...v2Dependencies,
      clock: new FakeClock(now),
    }).execute(request);
    expect(legacy.ok).toBe(true);
    expect(v2.ok).toBe(true);
    if (legacy.ok && v2.ok) {
      expect(canonicalJson(v2.value.legacyResult)).toBe(canonicalJson(legacy.value));
      expect(v2.value.deterministicFindings).toEqual(legacy.value.findings);
    }
  });

  it('treats an empty allowlist as exact-head producer-only analysis', async () => {
    const dependencies = await fixture();
    allow(dependencies.authorization, [producer]);
    const selectGeneration = vi.spyOn(dependencies.generations, 'selectGeneration');
    const result = await new AnalyzePullRequestV2({
      ...dependencies,
      clock: new FakeClock(now),
    }).execute({
      ...input('ana_01990f64-0000-7000-8000-000000000503'),
      consumerScope: { mode: 'allowlist', repositoryIds: [] },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        schemaVersion: '2.0',
        state: 'complete',
        scope: {
          mode: 'allowlist',
          requestedRepositoryIds: [],
          repositories: [{ repositoryId: producer, producer: true }],
        },
        coverage: {
          state: 'complete',
          enabledFamilies: [],
          repositories: [{ repositoryId: producer }],
        },
        legacyResult: { consumers: [{ repositoryId: producer }] },
        deterministicFindings: [],
        reasoningHypotheses: [],
        executionBudgets: [{ lane: 'pull_request' }],
      },
    });
    if (!result.ok) throw new Error(result.failure.code);
    expect(
      await dependencies.v2Results.getAnalysisV2(workspace, result.value.legacyResult.analysisId),
    ).toEqual({
      ok: true,
      value: result.value,
    });
    expect(selectGeneration).not.toHaveBeenCalled();
  });

  it('adds scoped new-family findings without changing the nested legacy result', async () => {
    const dependencies = await fixture();
    allow(dependencies.authorization, [producer]);
    const canonicalKey = 'event-destination-v1:kafka#prod#topic#orders';
    const versions = {
      adapterId: adapterId('reverb.events'),
      adapterVersion: '0.1.0',
      extractionVersion: '1',
      identityVersion: 1,
      partitioningVersion: 1,
      compatibilityVersion: '1',
    } as const;
    const definition = {
      workspaceId: workspace,
      repositoryId: producer,
      generationId: baseGeneration,
      commitSha: baseSha,
      family: 'events' as const,
      contractKind: 'event.destination' as const,
      canonicalKey,
      path: repoPath('producer/events.yaml'),
      contentHash: hash,
      shapeHash: hash,
      ...versions,
      configRevision: config,
      evidenceStratum: 'event_manifest',
    };
    const reference = {
      workspaceId: workspace,
      repositoryId: producer,
      generationId: producerHeadGeneration,
      commitSha: headSha,
      family: 'events' as const,
      contractKind: 'event.destination' as const,
      canonicalKey,
      semanticOwner: 'consumer:kafka:orders',
      stableReferenceId: deriveStableReferenceIdV2({
        family: 'events',
        contractKind: 'event.destination',
        canonicalKey,
        semanticOwner: 'consumer:kafka:orders',
        evidenceStratum: 'event_manifest',
      }),
      path: repoPath('consumer/events.yaml'),
      contentHash: hash,
      ...versions,
      configRevision: config,
      evidenceStratum: 'event_manifest',
      activation: 'on_deploy' as const,
    };
    const change = {
      workspaceId: workspace,
      producerRepositoryId: producer,
      baseGenerationId: baseGeneration,
      headGenerationId: producerHeadGeneration,
      baseSha,
      headSha,
      family: 'events' as const,
      contractKind: 'event.destination' as const,
      canonicalKey,
      changeKind: 'destination_removed',
      compatibility: 'breaking' as const,
      activation: 'on_deploy' as const,
      ...versions,
      coverageState: 'complete' as const,
      coverageDependencies: ['events.base.complete', 'events.head.complete'],
      remedy: {
        kind: 'coordinate_contract_rollout',
        text: 'Coordinate event consumers before removal.',
      },
    };
    const result = await new AnalyzePullRequestV2({
      ...dependencies,
      coverage: { readRepositoryCoverage: async () => portSuccess(producerEventsCoverage()) },
      clock: new FakeClock(now),
    }).execute({
      ...input('ana_01990f64-0000-7000-8000-000000000504'),
      consumerScope: { mode: 'allowlist', repositoryIds: [] },
      enabledAdapterFamilies: ['events'],
      deterministicEvidence: {
        definitions: [definition],
        references: [reference],
        changes: [change],
      },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        state: 'complete',
        legacyResult: { findings: [] },
        deterministicFindings: [
          {
            schemaVersion: '2.0',
            family: 'events',
            state: 'PREVIEW',
            claims: { edge: 'candidate', impact: 'breaking', action: 'coordinate' },
            edge: { producerRepositoryId: producer, consumerRepositoryId: producer },
          },
        ],
      },
    });
  });

  it('never selects or authorizes repositories omitted from an explicit allowlist', async () => {
    const dependencies = await fixture();
    allow(dependencies.authorization, [producer, consumer]);
    const selectGeneration = vi.spyOn(dependencies.generations, 'selectGeneration');
    const authorize = vi.spyOn(dependencies.authorization, 'authorizeRepositoryUse');
    const result = await new AnalyzePullRequestV2({
      ...dependencies,
      clock: new FakeClock(now),
    }).execute({
      ...input('ana_01990f64-0000-7000-8000-000000000505'),
      consumerScope: { mode: 'allowlist', repositoryIds: [consumer] },
    });
    expect(result).toMatchObject({
      ok: true,
      value: { state: 'partial', scope: { requestedRepositoryIds: [consumer] } },
    });
    expect(selectGeneration.mock.calls.map(([query]) => query.repositoryId)).toEqual([consumer]);
    expect(authorize.mock.calls.map(([, , repositoryId]) => repositoryId)).not.toContain(
      unselectedCanary,
    );
  });

  it('reports denied requested consumers without selecting their generation', async () => {
    const dependencies = await fixture();
    allow(dependencies.authorization, [producer]);
    const selectGeneration = vi.spyOn(dependencies.generations, 'selectGeneration');
    const result = await new AnalyzePullRequestV2({
      ...dependencies,
      clock: new FakeClock(now),
    }).execute({
      ...input('ana_01990f64-0000-7000-8000-000000000507'),
      consumerScope: { mode: 'allowlist', repositoryIds: [consumer] },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        state: 'partial',
        scope: {
          repositories: [{ repositoryId: producer }],
          gaps: [{ repositoryId: consumer, reason: 'authorization_denied' }],
        },
      },
    });
    expect(selectGeneration).not.toHaveBeenCalled();
  });

  it('does not read generation or overlay state when producer authorization fails', async () => {
    const dependencies = await fixture();
    const getGeneration = vi.spyOn(dependencies.generations, 'getGeneration');
    const getOverlay = vi.spyOn(dependencies.generations, 'getOverlay');
    const result = await new AnalyzePullRequestV2({
      ...dependencies,
      clock: new FakeClock(now),
    }).execute({
      ...input('ana_01990f64-0000-7000-8000-000000000506'),
      consumerScope: { mode: 'allowlist', repositoryIds: [] },
    });
    expect(result).toMatchObject({ ok: false, failure: { kind: 'authorization_denied' } });
    expect(getGeneration).not.toHaveBeenCalled();
    expect(getOverlay).not.toHaveBeenCalled();
  });

  it('records exact enabled-family provenance and never treats missing coverage as clean', async () => {
    const dependencies = await fixture();
    allow(dependencies.authorization, [producer]);
    const readRepositoryCoverage = vi.fn(async () => portSuccess(producerEventsCoverage()));
    const complete = await new AnalyzePullRequestV2({
      ...dependencies,
      coverage: { readRepositoryCoverage },
      clock: new FakeClock(now),
    }).execute({
      ...input('ana_01990f64-0000-7000-8000-000000000508'),
      consumerScope: { mode: 'allowlist', repositoryIds: [] },
      enabledAdapterFamilies: ['events'],
    });
    expect(complete).toMatchObject({
      ok: true,
      value: {
        state: 'complete',
        coverage: {
          state: 'complete',
          enabledFamilies: ['events'],
          repositories: [
            {
              repositoryId: producer,
              generationId: producerHeadGeneration,
              commitSha: headSha,
              families: [{ family: 'events', state: 'complete' }],
            },
          ],
        },
      },
    });
    expect(readRepositoryCoverage).toHaveBeenCalledOnce();

    const missing = await new AnalyzePullRequestV2({
      ...dependencies,
      clock: new FakeClock(now),
    }).execute({
      ...input('ana_01990f64-0000-7000-8000-000000000509'),
      consumerScope: { mode: 'allowlist', repositoryIds: [] },
      enabledAdapterFamilies: ['events'],
    });
    expect(missing).toMatchObject({
      ok: true,
      value: {
        state: 'partial',
        coverage: {
          state: 'partial',
          repositories: [
            {
              families: [
                {
                  family: 'events',
                  state: 'not_analysed',
                  limitations: [{ code: 'repository_current' }],
                },
              ],
            },
          ],
        },
      },
    });
  });
});
