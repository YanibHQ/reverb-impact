import {
  analysisId,
  commitSha,
  configRevision,
  contentHash,
  createRegistrySnapshot,
  generationId,
  generationLeaseId,
  instant,
  overlayId,
  policyRevision,
  repositoryStableId,
  treeHash,
  workspaceId,
} from '@yanib/reverb-domain';
import { AnalyzePullRequestV2 } from '@yanib/reverb-application';
import { describe, expect, it, vi } from 'vitest';

import {
  FakeClock,
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
  return { generations, evidence, registry, authorization };
}

function input(id: string) {
  return {
    schemaMajor: 2 as const,
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

describe('AnalyzePullRequestV2 bounded scope', () => {
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
        legacyResult: { consumers: [{ repositoryId: producer }] },
        deterministicFindings: [],
        reasoningHypotheses: [],
        executionBudgets: [{ lane: 'pull_request' }],
      },
    });
    expect(selectGeneration).not.toHaveBeenCalled();
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
});
