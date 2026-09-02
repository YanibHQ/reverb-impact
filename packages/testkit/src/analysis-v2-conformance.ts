import {
  analysisId,
  commitSha,
  contentHash,
  finalizeAnalysisCoverageV2,
  finalizeAnalysisResult,
  finalizeAnalysisResultV2,
  finalizeExecutionBudgetReportV2,
  finalizeRepositoryAnalysisCoverageV2,
  generationId,
  instant,
  policyRevision,
  registryRevision,
  repositoryStableId,
  workspaceId,
  type AnalysisId,
  type AnalysisResultV2,
  type AnalysisScopeProvenanceV2,
  type RepositoryStableId,
  type WorkspaceId,
} from '@yanib/reverb-domain';
import type { AnalysisResultStoreV2 } from '@yanib/reverb-application';
import assert from 'node:assert/strict';

export interface AnalysisResultStoreV2ConformanceInput {
  readonly store: AnalysisResultStoreV2;
  readonly workspaceId?: WorkspaceId;
  readonly otherWorkspaceId?: WorkspaceId;
  readonly analysisId?: AnalysisId;
  readonly producerRepositoryId?: RepositoryStableId;
}

export function analysisResultV2Fixture(
  input: Omit<AnalysisResultStoreV2ConformanceInput, 'store' | 'otherWorkspaceId'> = {},
): AnalysisResultV2 {
  const workspace = input.workspaceId ?? workspaceId('wsp_01990f64-0000-7000-8000-000000000530');
  const producer =
    input.producerRepositoryId ?? repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
  const analysis = input.analysisId ?? analysisId('ana_01990f64-0000-7000-8000-000000000530');
  const revision = registryRevision(`reg_sha256:${'2'.repeat(64)}`);
  const observedAt = instant('2026-09-02T22:00:00.000Z');
  const headGeneration = generationId('gen_01990f64-0000-7000-8000-000000000530');
  const scope: AnalysisScopeProvenanceV2 = {
    schema: 'reverb.analysis-scope',
    schemaVersion: '2.0',
    workspaceId: workspace,
    registryRevision: revision,
    producerRepositoryId: producer,
    mode: 'allowlist',
    requestedRepositoryIds: [],
    repositories: [
      {
        repositoryId: producer,
        producer: true,
        requested: false,
        consentRevision: 'producer-consent',
        authorizationRevision: revision,
        authorizationDecisionHash: contentHash(`sha256:${'3'.repeat(64)}`),
      },
    ],
    gaps: [],
    scopeHash: contentHash(`sha256:${'4'.repeat(64)}`),
  };
  const legacyResult = finalizeAnalysisResult({
    schema: 'reverb.analysis-result',
    schemaVersion: '1.0',
    analysisId: analysis,
    workspaceId: workspace,
    producerRepositoryId: producer,
    pullRequest: {
      provider: 'local',
      number: 1,
      baseSha: commitSha('a'.repeat(40)),
      headSha: commitSha('b'.repeat(40)),
    },
    registryRevision: revision,
    policyRevision: policyRevision(`pol_sha256:${'5'.repeat(64)}`),
    policyMajor: 1,
    state: 'complete',
    current: true,
    consumers: [
      {
        repositoryId: producer,
        state: 'current',
        generationId: headGeneration,
        commitSha: commitSha('b'.repeat(40)),
        selectedAt: observedAt,
        freshnessAgeMs: 0,
        coverageState: 'complete',
      },
    ],
    findings: [],
    abstentions: [],
    startedAt: observedAt,
    completedAt: observedAt,
  });
  const coverage = finalizeAnalysisCoverageV2({
    scope,
    enabledFamilies: [],
    repositories: [
      finalizeRepositoryAnalysisCoverageV2({
        workspaceId: workspace,
        registryRevision: revision,
        repositoryId: producer,
        role: 'producer_consumer',
        selectionState: 'current',
        generationId: headGeneration,
        commitSha: commitSha('b'.repeat(40)),
        selectedAt: observedAt,
        freshnessAgeMs: 0,
        families: [],
      }),
    ],
  });
  return finalizeAnalysisResultV2({
    schema: 'reverb.analysis-result',
    schemaVersion: '2.0',
    legacyResult,
    scope,
    coverage,
    state: 'complete',
    executionBudgets: [
      finalizeExecutionBudgetReportV2({
        schema: 'reverb.execution-budget',
        schemaVersion: '2.0',
        lane: 'pull_request',
        limits: {
          providerRequests: 0,
          sourceBytes: 0,
          storageQueries: 16,
          artifacts: 16,
          modelTokens: 0,
          latencyMs: 1_000,
        },
        usage: {
          providerRequests: 0,
          sourceBytes: 0,
          storageQueries: 6,
          artifacts: 0,
          modelTokens: 0,
          latencyMs: 0,
        },
        exhaustedDimensions: [],
        startedAt: observedAt,
        completedAt: observedAt,
      }),
    ],
    deterministicFindings: [],
    reasoningHypotheses: [],
  });
}

export async function runAnalysisResultStoreV2Conformance(
  input: AnalysisResultStoreV2ConformanceInput,
): Promise<void> {
  const fixture = analysisResultV2Fixture(input);
  assert.equal((await input.store.persistAnalysisV2(fixture)).ok, true);
  assert.equal((await input.store.persistAnalysisV2(fixture)).ok, true);
  assert.deepEqual(
    await input.store.getAnalysisV2(
      fixture.legacyResult.workspaceId,
      fixture.legacyResult.analysisId,
    ),
    { ok: true, value: fixture },
  );

  const { outputHash: _fixtureHash, ...fixtureInput } = fixture;
  void _fixtureHash;
  const conflict = finalizeAnalysisResultV2({
    ...fixtureInput,
    reasoningHypotheses: [
      {
        evidenceBasis: 'ai_inferred',
        disposition: 'withheld',
        producerCitationIds: [],
        consumerCitationIds: [],
        limitations: ['conformance-conflict'],
      },
    ],
  });
  assert.equal((await input.store.persistAnalysisV2(conflict)).ok, false);

  const otherWorkspace =
    input.otherWorkspaceId ?? workspaceId('wsp_01990f64-0000-7000-8000-000000000531');
  assert.deepEqual(
    await input.store.getAnalysisV2(otherWorkspace, fixture.legacyResult.analysisId),
    { ok: true, value: null },
  );
}
