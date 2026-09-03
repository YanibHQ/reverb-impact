import {
  analysisId,
  commitSha,
  contentHash,
  finalizeAnalysisCoverageV2,
  finalizeAnalysisResult,
  finalizeAnalysisResultV2,
  finalizeExecutionBudgetReportV2,
  finalizeRepositoryAnalysisCoverageV2,
  finalizeReasoningRunV2,
  generationId,
  instant,
  policyRevision,
  reasoningRunIdentity,
  repoPath,
  registryRevision,
  repositoryStableId,
  workspaceId,
  type AnalysisId,
  type AnalysisResultV2,
  type AnalysisScopeProvenanceV2,
  type RepositoryStableId,
  type WorkspaceId,
} from '@yanib/reverb-domain';
import type { AnalysisResultStoreV2, ReasoningRunStoreV2 } from '@yanib/reverb-application';
import assert from 'node:assert/strict';

export interface AnalysisResultStoreV2ConformanceInput {
  readonly store: AnalysisResultStoreV2 & ReasoningRunStoreV2;
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
        severity: 'low',
        confidence: 'low',
        producerCitationIds: [],
        consumerCitationIds: [],
        limitations: ['weak_evidence'],
      },
    ],
  });
  assert.equal((await input.store.persistAnalysisV2(conflict)).ok, false);

  const reasonedBase = analysisResultV2Fixture({
    ...input,
    analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000533'),
  });
  const reasoningBudget = finalizeExecutionBudgetReportV2({
    schema: 'reverb.execution-budget',
    schemaVersion: '2.0',
    lane: 'reasoning',
    limits: {
      providerRequests: 1,
      sourceBytes: 1024,
      storageQueries: 3,
      artifacts: 2,
      modelTokens: 100,
      latencyMs: 1000,
    },
    usage: {
      providerRequests: 1,
      sourceBytes: 64,
      storageQueries: 3,
      artifacts: 2,
      modelTokens: 10,
      latencyMs: 1,
    },
    exhaustedDimensions: [],
    startedAt: reasonedBase.legacyResult.startedAt,
    completedAt: reasonedBase.legacyResult.completedAt,
  });
  const hypothesis = {
    evidenceBasis: 'ai_inferred' as const,
    disposition: 'needs_investigation' as const,
    severity: 'medium' as const,
    confidence: 'medium' as const,
    producerCitationIds: [`cit_sha256:${'6'.repeat(64)}`],
    consumerCitationIds: [`cit_sha256:${'7'.repeat(64)}`],
    limitations: [],
  };
  const { outputHash: _reasonedHash, ...reasonedInput } = reasonedBase;
  void _reasonedHash;
  const reasoned = finalizeAnalysisResultV2({
    ...reasonedInput,
    executionBudgets: [...reasonedBase.executionBudgets, reasoningBudget],
    reasoningHypotheses: [hypothesis],
  });
  const inputHash = contentHash(`sha256:${'8'.repeat(64)}`);
  const provider = {
    providerId: 'conformance-provider',
    providerVersion: '1.0.0',
    modelId: 'conformance-model',
    modelVersion: '1',
    dataRegion: 'fixture',
    retentionMode: 'none' as const,
  };
  const run = finalizeReasoningRunV2({
    schema: 'reverb.reasoning-run',
    schemaVersion: '2.0',
    id: reasoningRunIdentity({
      analysisId: reasoned.legacyResult.analysisId,
      scopeHash: reasoned.scope.scopeHash,
      inputHash,
      provider,
      templateVersion: '1',
      reasoningPolicyVersion: '1',
      retrievalVersion: '1',
    }),
    workspaceId: reasoned.legacyResult.workspaceId,
    analysisId: reasoned.legacyResult.analysisId,
    scopeHash: reasoned.scope.scopeHash,
    state: 'complete',
    provider,
    templateVersion: '1',
    reasoningPolicyVersion: '1',
    retrievalVersion: '1',
    inputHash,
    providerOutputHash: contentHash(`sha256:${'9'.repeat(64)}`),
    executionBudget: reasoningBudget,
    consentDecisions: [
      {
        repositoryId: reasoned.scope.producerRepositoryId,
        allowed: true,
        revision: '1',
        decisionHash: contentHash(`sha256:${'5'.repeat(64)}`),
      },
    ],
    citations: [
      {
        citationId: hypothesis.producerCitationIds[0]!,
        origin: 'changed_definition',
        side: 'producer',
        workspaceId: reasoned.scope.workspaceId,
        repositoryId: reasoned.scope.producerRepositoryId,
        generationId: generationId('gen_01990f64-0000-7000-8000-000000000533'),
        commitSha: reasoned.legacyResult.pullRequest.baseSha,
        path: repoPath('producer.ts'),
        range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 },
        contentHash: inputHash,
        excerptHash: inputHash,
      },
      {
        citationId: hypothesis.consumerCitationIds[0]!,
        origin: 'deterministic_neighbor',
        side: 'consumer',
        workspaceId: reasoned.scope.workspaceId,
        repositoryId: reasoned.scope.producerRepositoryId,
        generationId: generationId('gen_01990f64-0000-7000-8000-000000000533'),
        commitSha: reasoned.legacyResult.pullRequest.headSha,
        path: repoPath('consumer.ts'),
        range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 },
        contentHash: inputHash,
        excerptHash: inputHash,
      },
    ],
    hypotheses: [hypothesis],
    limitations: [],
    createdAt: reasoned.legacyResult.completedAt,
  });
  const missingRun = await input.store.persistAnalysisV2(reasoned);
  assert.equal(missingRun.ok, false, 'reasoning data without its provenance run must be rejected');
  const persistedReasoning = await input.store.persistAnalysisV2(reasoned, run);
  assert.equal(persistedReasoning.ok, true, JSON.stringify(persistedReasoning));
  const persistedReasoningAgain = await input.store.persistAnalysisV2(reasoned, run);
  assert.equal(persistedReasoningAgain.ok, true, JSON.stringify(persistedReasoningAgain));
  assert.deepEqual(await input.store.getReasoningRunV2(run.workspaceId, run.id), {
    ok: true,
    value: run,
  });
  const deletedAt = instant('2026-09-02T22:01:00.000Z');
  const purged = await input.store.purgeReasoningRunV2(run.workspaceId, run.id, deletedAt);
  assert.equal(purged.ok, true);
  if (purged.ok) {
    assert.equal(purged.value?.state, 'deleted');
    assert.deepEqual(purged.value?.citations, []);
    assert.deepEqual(purged.value?.hypotheses, []);
    assert.equal(purged.value?.providerOutputHash, undefined);
    assert.equal(purged.value?.deletedAt, deletedAt);
  }
  const scrubbedAnalysis = await input.store.getAnalysisV2(
    reasoned.legacyResult.workspaceId,
    reasoned.legacyResult.analysisId,
  );
  assert.equal(scrubbedAnalysis.ok, true);
  if (scrubbedAnalysis.ok) {
    assert.deepEqual(scrubbedAnalysis.value?.reasoningHypotheses, []);
    assert.equal(
      scrubbedAnalysis.value?.executionBudgets.some((budget) => budget.lane === 'reasoning'),
      false,
    );
    assert.deepEqual(scrubbedAnalysis.value?.deterministicFindings, reasoned.deterministicFindings);
  }

  const otherWorkspace =
    input.otherWorkspaceId ?? workspaceId('wsp_01990f64-0000-7000-8000-000000000531');
  assert.deepEqual(
    await input.store.getAnalysisV2(otherWorkspace, fixture.legacyResult.analysisId),
    { ok: true, value: null },
  );
}
