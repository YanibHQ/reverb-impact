import type { AnalysisScopeProvenanceV2 } from './analysis-scope.js';
import { canonicalJson, hashCanonical } from './canonical.js';
import { finalizeAnalysisCoverageV2, type AnalysisCoverageV2 } from './coverage-v2.js';
import { invariant } from './errors.js';
import type { AnalysisResult } from './finding.js';
import type { FindingOccurrence } from './finding.js';
import type { DeterministicFindingV2 } from './evidence-v2.js';
import { finalizeExecutionBudgetReportV2, type ExecutionBudgetReportV2 } from './execution-v2.js';
import { finalizeReasoningHypothesisV2, type ReasoningHypothesisV2 } from './reasoning-v2.js';
import { contentHash } from './values.js';
import type { ContentHash } from './values.js';

export interface AnalysisResultV2 {
  readonly schema: 'reverb.analysis-result';
  readonly schemaVersion: '2.0';
  readonly legacyResult: AnalysisResult;
  readonly scope: AnalysisScopeProvenanceV2;
  readonly coverage: AnalysisCoverageV2;
  readonly state: Extract<AnalysisResult['state'], 'complete' | 'partial' | 'superseded'>;
  readonly executionBudgets: readonly ExecutionBudgetReportV2[];
  readonly deterministicFindings: readonly (FindingOccurrence | DeterministicFindingV2)[];
  readonly reasoningHypotheses: readonly ReasoningHypothesisV2[];
  readonly outputHash: ContentHash;
}

export function finalizeAnalysisResultV2(
  input: Omit<AnalysisResultV2, 'outputHash'>,
): AnalysisResultV2 {
  invariant(
    input.legacyResult.workspaceId === input.scope.workspaceId &&
      input.legacyResult.producerRepositoryId === input.scope.producerRepositoryId &&
      input.legacyResult.registryRevision === input.scope.registryRevision &&
      input.coverage.workspaceId === input.scope.workspaceId &&
      input.coverage.registryRevision === input.scope.registryRevision &&
      input.coverage.scopeHash === input.scope.scopeHash,
    'invalid_schema',
    'V2 result scope, coverage, and legacy provenance must identify the same analysis inputs.',
  );
  const expectedCoverage = finalizeAnalysisCoverageV2({
    scope: input.scope,
    enabledFamilies: input.coverage.enabledFamilies,
    repositories: input.coverage.repositories,
  });
  invariant(
    canonicalJson(expectedCoverage) === canonicalJson(input.coverage),
    'invalid_schema',
    'V2 result coverage must be canonical.',
  );
  const legacyFindings = input.deterministicFindings.filter(
    (value): value is FindingOccurrence => !('schemaVersion' in value),
  );
  const newFamilyFindings = input.deterministicFindings.filter(
    (value): value is DeterministicFindingV2 =>
      'schemaVersion' in value && value.schemaVersion === '2.0',
  );
  invariant(
    canonicalJson(legacyFindings) === canonicalJson(input.legacyResult.findings),
    'invalid_schema',
    'The v1 subset of v2 deterministic findings must remain identical to the legacy result.',
  );
  const scopedRepositories = new Set(input.scope.repositories.map((value) => value.repositoryId));
  const enabledFamilies = new Set(input.coverage.enabledFamilies);
  invariant(
    newFamilyFindings.every(
      (finding) =>
        finding.analysisId === input.legacyResult.analysisId &&
        finding.change.workspaceId === input.scope.workspaceId &&
        finding.change.producerRepositoryId === input.scope.producerRepositoryId &&
        finding.edge.producerRepositoryId === input.scope.producerRepositoryId &&
        finding.family === finding.change.family &&
        finding.family === finding.edge.family &&
        enabledFamilies.has(finding.family) &&
        scopedRepositories.has(finding.edge.consumerRepositoryId),
    ),
    'invalid_schema',
    'New-family deterministic findings must match the analysis, enabled families, and resolved scope.',
  );
  const incomplete =
    (input.legacyResult.state !== 'complete' && input.legacyResult.state !== 'superseded') ||
    input.coverage.state === 'partial' ||
    input.scope.gaps.length > 0 ||
    input.executionBudgets.some((budget) => budget.exhaustedDimensions.length > 0);
  invariant(
    input.legacyResult.state === 'superseded'
      ? input.state === 'superseded'
      : input.state !== 'superseded' && (!incomplete || input.state === 'partial'),
    'invalid_schema',
    'V2 result state cannot present incomplete or superseded evidence as complete.',
  );
  for (const budget of input.executionBudgets) {
    const { outputHash: _outputHash, ...budgetInput } = budget;
    void _outputHash;
    invariant(
      canonicalJson(finalizeExecutionBudgetReportV2(budgetInput)) === canonicalJson(budget),
      'invalid_schema',
      'V2 execution budget reports must be canonical.',
    );
  }
  invariant(
    new Set(input.executionBudgets.map((budget) => budget.lane)).size ===
      input.executionBudgets.length,
    'invalid_schema',
    'V2 execution budget lanes must be unique.',
  );
  const canonical = {
    ...input,
    deterministicFindings: [...input.deterministicFindings].sort((left, right) =>
      left.fingerprint.localeCompare(right.fingerprint),
    ),
    executionBudgets: [...input.executionBudgets].sort((left, right) =>
      left.lane.localeCompare(right.lane),
    ),
    reasoningHypotheses: input.reasoningHypotheses
      .map(finalizeReasoningHypothesisV2)
      .sort((left, right) => hashCanonical(left).localeCompare(hashCanonical(right))),
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

export function removeReasoningFromAnalysisResultV2(result: AnalysisResultV2): AnalysisResultV2 {
  const executionBudgets = result.executionBudgets.filter((budget) => budget.lane !== 'reasoning');
  const incomplete =
    (result.legacyResult.state !== 'complete' && result.legacyResult.state !== 'superseded') ||
    result.coverage.state === 'partial' ||
    result.scope.gaps.length > 0 ||
    executionBudgets.some((budget) => budget.exhaustedDimensions.length > 0);
  const state =
    result.legacyResult.state === 'superseded' ? 'superseded' : incomplete ? 'partial' : 'complete';
  const { outputHash: _outputHash, ...input } = result;
  void _outputHash;
  return finalizeAnalysisResultV2({
    ...input,
    state,
    executionBudgets,
    reasoningHypotheses: [],
  });
}
