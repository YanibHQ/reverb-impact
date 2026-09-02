import type { AnalysisScopeProvenanceV2 } from './analysis-scope.js';
import { canonicalJson, hashCanonical } from './canonical.js';
import { finalizeAnalysisCoverageV2, type AnalysisCoverageV2 } from './coverage-v2.js';
import { invariant } from './errors.js';
import type { AnalysisResult } from './finding.js';
import { finalizeExecutionBudgetReportV2, type ExecutionBudgetReportV2 } from './execution-v2.js';
import { contentHash } from './values.js';
import type { ContentHash } from './values.js';

export interface ReasoningHypothesisV2 {
  readonly evidenceBasis: 'ai_inferred';
  readonly disposition: 'needs_investigation' | 'withheld';
  readonly producerCitationIds: readonly string[];
  readonly consumerCitationIds: readonly string[];
  readonly limitations: readonly string[];
}

export interface AnalysisResultV2 {
  readonly schema: 'reverb.analysis-result';
  readonly schemaVersion: '2.0';
  readonly legacyResult: AnalysisResult;
  readonly scope: AnalysisScopeProvenanceV2;
  readonly coverage: AnalysisCoverageV2;
  readonly state: Extract<AnalysisResult['state'], 'complete' | 'partial' | 'superseded'>;
  readonly executionBudgets: readonly ExecutionBudgetReportV2[];
  readonly deterministicFindings: AnalysisResult['findings'];
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
  invariant(
    canonicalJson(input.deterministicFindings) === canonicalJson(input.legacyResult.findings),
    'invalid_schema',
    'V2 deterministic findings must remain identical to the legacy deterministic result.',
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
    reasoningHypotheses: [...input.reasoningHypotheses],
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}
